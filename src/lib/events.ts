import "server-only";
import { Client } from "pg";
import { pool } from "@/db";

const BOARD_CHANNEL = "ushabti_events";
const CHAT_CHANNEL = "ushabti_chat_events";

export type BoardEvent = {
  projectId: string;
  /** board = columns, tasks or properties moved. task = one task changed. */
  scope: "board" | "task" | "project";
  taskId?: string;
  /** The browser tab that caused the change. It skips its own echo. */
  clientId?: string;
};

export type ChatEvent = {
  type: "new_message" | "read" | "room_updated";
  roomId: string;
  senderId?: string;
  userId?: string;
  clientId?: string;
  message?: any;
  lastReadAt?: string;
  timestamp: string;
};

type BoardListener = (event: BoardEvent) => void;
type ChatListener = (event: ChatEvent) => void;

type Hub = {
  listeners: Map<string, Set<BoardListener>>;
  chatListeners: Set<ChatListener>;
  client: Client | null;
  connecting: Promise<void> | null;
};

const globalForHub = globalThis as unknown as { __ushabtiHub?: Hub };

const hub: Hub =
  globalForHub.__ushabtiHub ??
  (globalForHub.__ushabtiHub = {
    listeners: new Map(),
    chatListeners: new Set(),
    client: null,
    connecting: null,
  });

async function ensureListener(): Promise<void> {
  if (hub.client) return;
  if (hub.connecting) return hub.connecting;

  hub.connecting = (async () => {
    const client = new Client({
      connectionString:
        process.env.DATABASE_URL ?? "postgres://ushabti:ushabti@localhost:5435/ushabti",
    });
    client.on("error", () => {
      hub.client = null;
      hub.connecting = null;
    });
    client.on("end", () => {
      hub.client = null;
      hub.connecting = null;
    });
    client.on("notification", (msg) => {
      if (!msg.payload) return;
      if (msg.channel === CHAT_CHANNEL) {
        let event: ChatEvent;
        try {
          event = JSON.parse(msg.payload) as ChatEvent;
        } catch {
          return;
        }
        for (const fn of hub.chatListeners) fn(event);
        return;
      }

      let event: BoardEvent;
      try {
        event = JSON.parse(msg.payload) as BoardEvent;
      } catch {
        return;
      }
      const set = hub.listeners.get(event.projectId);
      if (!set) return;
      for (const fn of set) fn(event);
    });
    await client.connect();
    await client.query(`LISTEN ${BOARD_CHANNEL}`);
    await client.query(`LISTEN ${CHAT_CHANNEL}`);
    hub.client = client;
  })();

  try {
    await hub.connecting;
  } finally {
    hub.connecting = null;
  }
}

export async function subscribe(projectId: string, fn: BoardListener): Promise<() => void> {
  await ensureListener();
  let set = hub.listeners.get(projectId);
  if (!set) {
    set = new Set();
    hub.listeners.set(projectId, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) hub.listeners.delete(projectId);
  };
}

export async function publish(event: BoardEvent): Promise<void> {
  try {
    await pool.query("SELECT pg_notify($1, $2)", [BOARD_CHANNEL, JSON.stringify(event)]);
  } catch {
    // A failed broadcast must never break the write that caused it.
  }
}

export async function subscribeChat(fn: ChatListener): Promise<() => void> {
  await ensureListener();
  hub.chatListeners.add(fn);
  return () => {
    hub.chatListeners.delete(fn);
  };
}

export async function publishChat(event: ChatEvent): Promise<void> {
  try {
    await pool.query("SELECT pg_notify($1, $2)", [CHAT_CHANNEL, JSON.stringify(event)]);
  } catch {
    // A failed broadcast must never break the write that caused it.
  }
}
