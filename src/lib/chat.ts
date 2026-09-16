import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { chatMessages, chatRoomMembers, chatRooms, users, workspaceMembers, workspaces } from "@/db/schema";
import { emailSender } from "@/lib/emailSender";

export type ChatMessageDTO = {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderColor: string;
  senderPhotoUrl: string | null;
  content: string;
  createdAt: string;
};

export type ChatRoomDTO = {
  id: string;
  kind: "global" | "workspace" | "direct";
  name: string;
  workspaceId?: string | null;
  unreadCount: number;
  lastMessage?: {
    content: string;
    senderName: string;
    createdAt: string;
  } | null;
  otherUser?: {
    id: string;
    name: string;
    email: string;
    color: string;
    photoUrl: string | null;
    userType?: "staff" | "volunteer";
    lastActiveAt?: string | null;
    isOnline?: boolean;
  } | null;
};

/**
 * Get or create the organization-wide Global chat room.
 */
export async function getOrCreateGlobalRoom(): Promise<string> {
  const [existing] = await db
    .select({ id: chatRooms.id })
    .from(chatRooms)
    .where(eq(chatRooms.kind, "global"))
    .limit(1);

  if (existing) return existing.id;

  const [created] = await db
    .insert(chatRooms)
    .values({
      kind: "global",
      name: "All Staff",
    })
    .returning({ id: chatRooms.id });

  return created.id;
}

/**
 * Get or create the workspace chat room for a workspace.
 */
export async function getOrCreateWorkspaceRoom(
  workspaceId: string,
  workspaceName?: string,
): Promise<string> {
  const [existing] = await db
    .select({ id: chatRooms.id })
    .from(chatRooms)
    .where(and(eq(chatRooms.kind, "workspace"), eq(chatRooms.workspaceId, workspaceId)))
    .limit(1);

  if (existing) return existing.id;

  const [created] = await db
    .insert(chatRooms)
    .values({
      kind: "workspace",
      workspaceId,
      name: workspaceName ? `${workspaceName} Chat` : "Workspace Chat",
    })
    .returning({ id: chatRooms.id });

  return created.id;
}

/**
 * Get or create a 1-on-1 Direct Message room between two staff members.
 */
export async function getOrCreateDirectRoom(userAId: string, userBId: string): Promise<string> {
  if (userAId === userBId) {
    throw new Error("Cannot open DM with yourself");
  }

  // Find existing room where both users are members
  const memberRooms = await db
    .select({ roomId: chatRoomMembers.roomId })
    .from(chatRoomMembers)
    .innerJoin(chatRooms, eq(chatRooms.id, chatRoomMembers.roomId))
    .where(and(eq(chatRooms.kind, "direct"), inArray(chatRoomMembers.userId, [userAId, userBId])));

  const roomCounts = new Map<string, number>();
  for (const r of memberRooms) {
    roomCounts.set(r.roomId, (roomCounts.get(r.roomId) || 0) + 1);
  }

  for (const [roomId, count] of roomCounts.entries()) {
    if (count === 2) {
      return roomId;
    }
  }

  // Otherwise, create a new direct room and assign members
  const [newRoom] = await db
    .insert(chatRooms)
    .values({
      kind: "direct",
    })
    .returning({ id: chatRooms.id });

  await db.insert(chatRoomMembers).values([
    { roomId: newRoom.id, userId: userAId, lastReadAt: new Date() },
    { roomId: newRoom.id, userId: userBId, lastReadAt: new Date(0) },
  ]);

  return newRoom.id;
}

/**
 * List all chat rooms for a user (Global, active Workspace, and DMs).
 */
export async function listUserChatRooms(
  userId: string,
  activeWorkspaceId?: string,
): Promise<{
  globalRoom: ChatRoomDTO;
  workspaceRooms: ChatRoomDTO[];
  directRooms: ChatRoomDTO[];
  allStaff: Array<{
    id: string;
    name: string;
    email: string;
    color: string;
    photoUrl: string | null;
  }>;
}> {
  // Ensure global room exists
  const globalRoomId = await getOrCreateGlobalRoom();

  // Fetch all workspaces the user belongs to (or has membership)
  const userWorkspaces = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      iconUrl: workspaces.iconUrl,
    })
    .from(workspaces)
    .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(workspaces.createdAt);

  // If activeWorkspaceId provided and not in userWorkspaces list (e.g. super admin), include it too
  if (activeWorkspaceId && !userWorkspaces.some((w) => w.id === activeWorkspaceId)) {
    const [extraWs] = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        iconUrl: workspaces.iconUrl,
      })
      .from(workspaces)
      .where(eq(workspaces.id, activeWorkspaceId))
      .limit(1);
    if (extraWs) userWorkspaces.push(extraWs);
  }

  const now = Date.now();

  // Fetch all staff & volunteers
  const staffRows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      color: users.color,
      photoUrl: users.photoUrl,
      userType: users.userType,
      lastActiveAt: users.lastActiveAt,
    })
    .from(users)
    .where(eq(users.kind, "human"))
    .orderBy(users.name);

  // Helper to get unread count and last message for a room
  async function getRoomDetails(roomId: string) {
    const [member] = await db
      .select({ lastReadAt: chatRoomMembers.lastReadAt })
      .from(chatRoomMembers)
      .where(and(eq(chatRoomMembers.roomId, roomId), eq(chatRoomMembers.userId, userId)))
      .limit(1);

    const lastRead = member?.lastReadAt ?? new Date(0);

    const [unreadRes] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(chatMessages)
      .where(and(eq(chatMessages.roomId, roomId), gt(chatMessages.createdAt, lastRead)));

    const [lastMsg] = await db
      .select({
        content: chatMessages.content,
        createdAt: chatMessages.createdAt,
        senderName: users.name,
      })
      .from(chatMessages)
      .innerJoin(users, eq(users.id, chatMessages.senderId))
      .where(eq(chatMessages.roomId, roomId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(1);

    return {
      unreadCount: unreadRes?.count ?? 0,
      lastMessage: lastMsg
        ? {
            content: lastMsg.content,
            senderName: lastMsg.senderName,
            createdAt: lastMsg.createdAt.toISOString(),
          }
        : null,
    };
  }

  const globalDetails = await getRoomDetails(globalRoomId);
  const globalRoom: ChatRoomDTO = {
    id: globalRoomId,
    kind: "global",
    name: "All Staff",
    unreadCount: globalDetails.unreadCount,
    lastMessage: globalDetails.lastMessage,
  };

  // Generate workspace rooms for each workspace
  const workspaceRooms: ChatRoomDTO[] = [];
  for (const ws of userWorkspaces) {
    const wsRoomId = await getOrCreateWorkspaceRoom(ws.id, ws.name);
    const wsDetails = await getRoomDetails(wsRoomId);
    workspaceRooms.push({
      id: wsRoomId,
      kind: "workspace",
      name: ws.name,
      workspaceId: ws.id,
      unreadCount: wsDetails.unreadCount,
      lastMessage: wsDetails.lastMessage,
    });
  }

  // Find all direct message rooms the user belongs to
  const userDmRooms = await db
    .select({
      roomId: chatRoomMembers.roomId,
    })
    .from(chatRoomMembers)
    .innerJoin(chatRooms, eq(chatRooms.id, chatRoomMembers.roomId))
    .where(and(eq(chatRoomMembers.userId, userId), eq(chatRooms.kind, "direct")));

  const directRooms: ChatRoomDTO[] = [];

  for (const dm of userDmRooms) {
    // Find other member
    const [otherMember] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        color: users.color,
        photoUrl: users.photoUrl,
        userType: users.userType,
        lastActiveAt: users.lastActiveAt,
      })
      .from(chatRoomMembers)
      .innerJoin(users, eq(users.id, chatRoomMembers.userId))
      .where(and(eq(chatRoomMembers.roomId, dm.roomId), sql`${chatRoomMembers.userId} != ${userId}`))
      .limit(1);

    if (otherMember) {
      const details = await getRoomDetails(dm.roomId);
      const isOnline = otherMember.lastActiveAt
        ? now - new Date(otherMember.lastActiveAt).getTime() < 3 * 60 * 1000
        : false;

      directRooms.push({
        id: dm.roomId,
        kind: "direct",
        name: otherMember.name,
        unreadCount: details.unreadCount,
        lastMessage: details.lastMessage,
        otherUser: {
          id: otherMember.id,
          name: otherMember.name,
          email: otherMember.email ?? "",
          color: otherMember.color,
          photoUrl: otherMember.photoUrl,
          userType: (otherMember.userType as "staff" | "volunteer") || "staff",
          lastActiveAt: otherMember.lastActiveAt ? otherMember.lastActiveAt.toISOString() : null,
          isOnline,
        },
      });
    }
  }

  return {
    globalRoom,
    workspaceRooms,
    directRooms,
    allStaff: staffRows.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email ?? "",
      color: s.color,
      photoUrl: s.photoUrl,
      userType: (s.userType as "staff" | "volunteer") || "staff",
      lastActiveAt: s.lastActiveAt ? s.lastActiveAt.toISOString() : null,
      isOnline: s.lastActiveAt ? now - new Date(s.lastActiveAt).getTime() < 3 * 60 * 1000 : false,
    })),
  };
}

/**
 * Send email notification to offline recipients in the background.
 */
async function dispatchOfflineChatNotification(
  roomId: string,
  senderId: string,
  senderName: string,
  content: string,
) {
  try {
    const [room] = await db
      .select({ id: chatRooms.id, kind: chatRooms.kind, name: chatRooms.name, workspaceId: chatRooms.workspaceId })
      .from(chatRooms)
      .where(eq(chatRooms.id, roomId))
      .limit(1);

    if (!room) return;

    const now = Date.now();
    const offlineThreshold = new Date(now - 3 * 60 * 1000); // 3 minutes
    const loginUrl = process.env.NEXT_PUBLIC_APP_URL || "https://flow.codingladies.org/login";
    const snippetHtml = content
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br/>");

    if (room.kind === "direct") {
      const otherMembers = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          lastActiveAt: users.lastActiveAt,
        })
        .from(chatRoomMembers)
        .innerJoin(users, eq(users.id, chatRoomMembers.userId))
        .where(and(eq(chatRoomMembers.roomId, roomId), sql`${chatRoomMembers.userId} != ${senderId}`));

      for (const recipient of otherMembers) {
        if (!recipient.email) continue;
        const isOffline = !recipient.lastActiveAt || new Date(recipient.lastActiveAt).getTime() < offlineThreshold.getTime();
        if (!isOffline) continue;

        await emailSender.sendEmail({
          to: recipient.email,
          email: recipient.email,
          subject: `[CLA Flow] New direct message from ${senderName}`,
          first_name: recipient.name.split(" ")[0] || recipient.name,
          html: `
            <p>Hello <strong>${recipient.name}</strong>,</p>
            <p><strong>${senderName}</strong> sent you a direct message on <strong>CLA Flow</strong>:</p>
            <div style="background: #f0fdfa; border-left: 4px solid #00BFB3; padding: 14px 18px; margin: 18px 0; border-radius: 6px; font-size: 14px; color: #1e293b;">
              ${snippetHtml}
            </div>
            <p style="color: #64748b; font-size: 13px;">You are receiving this email because you are currently offline on CLA Flow.</p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${loginUrl}" class="button" style="background-color: #00BFB3; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; display: inline-block;">Reply on CLA Flow</a>
            </div>
          `,
        });
      }
    } else if (room.kind === "workspace" && room.workspaceId) {
      const wsMembers = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          lastActiveAt: users.lastActiveAt,
        })
        .from(workspaceMembers)
        .innerJoin(users, eq(users.id, workspaceMembers.userId))
        .where(and(eq(workspaceMembers.workspaceId, room.workspaceId), sql`${workspaceMembers.userId} != ${senderId}`));

      const offlineRecipients = wsMembers
        .filter((m) => m.email && (!m.lastActiveAt || new Date(m.lastActiveAt).getTime() < offlineThreshold.getTime()))
        .map((m) => m.email as string);

      if (offlineRecipients.length > 0) {
        const roomTitle = room.name || "Workspace Chat";
        await emailSender.sendBulkEmail(
          offlineRecipients,
          {
            subject: `[CLA Flow] ${senderName} in #${roomTitle}`,
            html: `
              <p><strong>${senderName}</strong> posted a new message in <strong>#${roomTitle}</strong>:</p>
              <div style="background: #f0fdfa; border-left: 4px solid #00BFB3; padding: 14px 18px; margin: 18px 0; border-radius: 6px; font-size: 14px; color: #1e293b;">
                ${snippetHtml}
              </div>
              <p style="color: #64748b; font-size: 13px;">You are receiving this notification because you are currently offline.</p>
              <div style="text-align: center; margin: 24px 0;">
                <a href="${loginUrl}" class="button" style="background-color: #00BFB3; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; display: inline-block;">Open Workspace Chat</a>
              </div>
            `,
          }
        );
      }
    } else if (room.kind === "global") {
      const allHumans = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          lastActiveAt: users.lastActiveAt,
        })
        .from(users)
        .where(and(eq(users.kind, "human"), sql`${users.id} != ${senderId}`));

      const offlineRecipients = allHumans
        .filter((m) => m.email && (!m.lastActiveAt || new Date(m.lastActiveAt).getTime() < offlineThreshold.getTime()))
        .map((m) => m.email as string);

      if (offlineRecipients.length > 0) {
        await emailSender.sendBulkEmail(
          offlineRecipients,
          {
            subject: `[CLA Flow] ${senderName} in #All Staff`,
            html: `
              <p><strong>${senderName}</strong> posted a new message in <strong>#All Staff (Global)</strong>:</p>
              <div style="background: #f0fdfa; border-left: 4px solid #00BFB3; padding: 14px 18px; margin: 18px 0; border-radius: 6px; font-size: 14px; color: #1e293b;">
                ${snippetHtml}
              </div>
              <p style="color: #64748b; font-size: 13px;">You are receiving this notification because you are currently offline.</p>
              <div style="text-align: center; margin: 24px 0;">
                <a href="${loginUrl}" class="button" style="background-color: #00BFB3; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; display: inline-block;">Open CLA Flow Chat</a>
              </div>
            `,
          }
        );
      }
    }
  } catch (err) {
    console.error("Failed to dispatch offline chat notification:", err);
  }
}

/**
 * Fetch messages in a room.
 */
export async function listMessages(
  roomId: string,
  limit = 50,
  before?: string,
): Promise<ChatMessageDTO[]> {
  const conditions = [eq(chatMessages.roomId, roomId)];
  if (before) {
    conditions.push(sql`${chatMessages.createdAt} < ${new Date(before)}`);
  }

  const rows = await db
    .select({
      id: chatMessages.id,
      roomId: chatMessages.roomId,
      senderId: chatMessages.senderId,
      senderName: users.name,
      senderColor: users.color,
      senderPhotoUrl: users.photoUrl,
      content: chatMessages.content,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .innerJoin(users, eq(users.id, chatMessages.senderId))
    .where(and(...conditions))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);

  // Return oldest to newest for chat view
  return rows.reverse().map((r) => ({
    id: r.id,
    roomId: r.roomId,
    senderId: r.senderId,
    senderName: r.senderName,
    senderColor: r.senderColor,
    senderPhotoUrl: r.senderPhotoUrl,
    content: r.content,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Send a message in a room.
 */
export async function sendMessage(
  roomId: string,
  senderId: string,
  content: string,
): Promise<ChatMessageDTO> {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("Message content cannot be empty");
  }

  const [created] = await db
    .insert(chatMessages)
    .values({
      roomId,
      senderId,
      content: trimmed,
    })
    .returning();

  // Mark room read and touch lastActiveAt for sender
  await db
    .insert(chatRoomMembers)
    .values({
      roomId,
      userId: senderId,
      lastReadAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [chatRoomMembers.roomId, chatRoomMembers.userId],
      set: { lastReadAt: new Date() },
    });

  await db
    .update(users)
    .set({ lastActiveAt: new Date() })
    .where(eq(users.id, senderId));

  const [sender] = await db
    .select({
      name: users.name,
      color: users.color,
      photoUrl: users.photoUrl,
    })
    .from(users)
    .where(eq(users.id, senderId))
    .limit(1);

  const senderName = sender?.name ?? "Staff";

  // Asynchronously dispatch offline email notifications without blocking
  void dispatchOfflineChatNotification(roomId, senderId, senderName, trimmed);

  return {
    id: created.id,
    roomId: created.roomId,
    senderId: created.senderId,
    senderName,
    senderColor: sender?.color ?? "#6d5bd0",
    senderPhotoUrl: sender?.photoUrl ?? null,
    content: created.content,
    createdAt: created.createdAt.toISOString(),
  };
}

/**
 * Mark a room as read by user.
 */
export async function markRoomRead(roomId: string, userId: string): Promise<void> {
  await db
    .insert(chatRoomMembers)
    .values({
      roomId,
      userId,
      lastReadAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [chatRoomMembers.roomId, chatRoomMembers.userId],
      set: { lastReadAt: new Date() },
    });
}
