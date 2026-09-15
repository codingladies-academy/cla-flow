import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listMessages, sendMessage } from "@/lib/chat";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { roomId } = await params;
  const { searchParams } = new URL(req.url);
  const before = searchParams.get("before") || undefined;
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);

  try {
    const messages = await listMessages(roomId, limit, before);
    return NextResponse.json({ messages });
  } catch (err) {
    console.error("Error fetching messages:", err);
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { roomId } = await params;

  try {
    const body = await req.json();
    const content = body.content;
    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json({ error: "Message content cannot be empty" }, { status: 400 });
    }

    const message = await sendMessage(roomId, user.id, content);
    return NextResponse.json({ message });
  } catch (err) {
    console.error("Error sending message:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send message" },
      { status: 500 },
    );
  }
}
