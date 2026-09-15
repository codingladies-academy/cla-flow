import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getOrCreateDirectRoom, listUserChatRooms } from "@/lib/chat";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId") || undefined;

  try {
    const data = await listUserChatRooms(user.id, workspaceId);
    return NextResponse.json(data);
  } catch (err) {
    console.error("Error listing chat rooms:", err);
    return NextResponse.json({ error: "Failed to list chat rooms" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const targetUserId = body.targetUserId;
    if (!targetUserId || typeof targetUserId !== "string") {
      return NextResponse.json({ error: "targetUserId is required" }, { status: 400 });
    }

    const roomId = await getOrCreateDirectRoom(user.id, targetUserId);
    return NextResponse.json({ roomId });
  } catch (err) {
    console.error("Error creating direct chat:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to open direct chat" },
      { status: 500 },
    );
  }
}
