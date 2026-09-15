import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { chatMessages, chatRoomMembers, chatRooms, users, workspaceMembers, workspaces } from "@/db/schema";

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

  // Fetch all staff
  const staffRows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      color: users.color,
      photoUrl: users.photoUrl,
    })
    .from(users)
    .where(eq(users.kind, "human"));

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
      })
      .from(chatRoomMembers)
      .innerJoin(users, eq(users.id, chatRoomMembers.userId))
      .where(and(eq(chatRoomMembers.roomId, dm.roomId), sql`${chatRoomMembers.userId} != ${userId}`))
      .limit(1);

    if (otherMember) {
      const details = await getRoomDetails(dm.roomId);
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
    })),
  };
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

  // Mark room read for the sender
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

  const [sender] = await db
    .select({
      name: users.name,
      color: users.color,
      photoUrl: users.photoUrl,
    })
    .from(users)
    .where(eq(users.id, senderId))
    .limit(1);

  return {
    id: created.id,
    roomId: created.roomId,
    senderId: created.senderId,
    senderName: sender?.name ?? "Staff",
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
