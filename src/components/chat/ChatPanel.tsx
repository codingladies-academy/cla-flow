"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { Avatar } from "@/components/ui/Avatar";
import { CloseIcon, SendIcon } from "@/components/ui/Icons";
import { Markdown } from "@/components/ui/Markdown";
import { GooglePickerButton } from "@/components/drive/GooglePickerButton";
import { GoogleDriveCardList } from "@/components/drive/GoogleDriveCard";
import { playNotificationSound, sendDesktopNotification } from "@/lib/audio";
import type { SessionUser } from "@/components/ui/UserMenu";
import type { ChatMessageDTO, ChatRoomDTO } from "@/lib/chat";
import styles from "./ChatPanel.module.css";

export function ChatPanel({
  open,
  onClose,
  user,
  activeWorkspaceId,
  activeWorkspaceName,
  onUnreadCountChange,
}: {
  open: boolean;
  onClose: () => void;
  user: SessionUser;
  activeWorkspaceId?: string;
  activeWorkspaceName?: string;
  onUnreadCountChange?: (count: number) => void;
}) {
  const [globalRoom, setGlobalRoom] = useState<ChatRoomDTO | null>(null);
  const [workspaceRooms, setWorkspaceRooms] = useState<ChatRoomDTO[]>([]);
  const [directRooms, setDirectRooms] = useState<ChatRoomDTO[]>([]);
  const [allStaff, setAllStaff] = useState<
    Array<{
      id: string;
      name: string;
      email: string;
      color: string;
      photoUrl: string | null;
      userType?: "staff" | "volunteer";
      lastActiveAt?: string | null;
      isOnline?: boolean;
    }>
  >([]);

  const [activeRoomId, setActiveRoomId] = useState<string>("");
  const [activeRoomTitle, setActiveRoomTitle] = useState<string>("All Staff");
  const [activeOtherUser, setActiveOtherUser] = useState<{
    id: string;
    name: string;
    email: string;
    isOnline?: boolean;
    userType?: "staff" | "volunteer";
  } | null>(null);
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [inputText, setInputText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [readerPopoverId, setReaderPopoverId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastMessageIdRef = useRef<string>("");

  // Presence heartbeat when chat is active
  useEffect(() => {
    if (!open) return;
    void api.post("/api/presence", {}).catch(() => {});
    const pTimer = setInterval(() => {
      void api.post("/api/presence", {}).catch(() => {});
    }, 30000);
    return () => clearInterval(pTimer);
  }, [open]);

  // Request browser desktop notification permission on user interaction
  useEffect(() => {
    if (open && typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        void Notification.requestPermission();
      }
    }
  }, [open]);

  // Load chat rooms when opened or workspace changes
  async function loadRooms() {
    try {
      const url = activeWorkspaceId
        ? `/api/chat/rooms?workspaceId=${activeWorkspaceId}`
        : "/api/chat/rooms";
      const res = await api.get<{
        globalRoom: ChatRoomDTO;
        workspaceRooms: ChatRoomDTO[];
        directRooms: ChatRoomDTO[];
        allStaff: Array<{
          id: string;
          name: string;
          email: string;
          color: string;
          photoUrl: string | null;
          userType?: "staff" | "volunteer";
          lastActiveAt?: string | null;
          isOnline?: boolean;
        }>;
      }>(url);

      setGlobalRoom(res.globalRoom);
      setWorkspaceRooms(res.workspaceRooms ?? []);
      setDirectRooms(res.directRooms);
      setAllStaff(res.allStaff);

      const totalUnread =
        (res.globalRoom?.unreadCount ?? 0) +
        (res.workspaceRooms?.reduce((sum, r) => sum + (r.unreadCount ?? 0), 0) ?? 0) +
        res.directRooms.reduce((sum, r) => sum + (r.unreadCount ?? 0), 0);
      onUnreadCountChange?.(totalUnread);

      if (!activeRoomId && res.globalRoom) {
        setActiveRoomId(res.globalRoom.id);
        setActiveRoomTitle("All Staff");
        setActiveOtherUser(null);
      }
    } catch (err) {
      console.error("Failed to load chat rooms:", err);
    }
  }

  // Load messages for the active room
  async function loadMessages(roomId: string, silent = false) {
    if (!roomId) return;
    if (!silent) setLoadingMessages(true);
    try {
      const res = await api.get<{ messages: ChatMessageDTO[] }>(
        `/api/chat/rooms/${roomId}/messages`,
      );

      const newMessages = res.messages;
      if (newMessages.length > 0) {
        const latest = newMessages[newMessages.length - 1];
        if (
          silent &&
          lastMessageIdRef.current &&
          latest.id !== lastMessageIdRef.current &&
          latest.senderId !== user.id
        ) {
          playNotificationSound();
          sendDesktopNotification(`${latest.senderName} in ${activeRoomTitle}`, latest.content);
        }
        lastMessageIdRef.current = latest.id;
      }

      setMessages(newMessages);

      // Mark room read
      await api.post(`/api/chat/rooms/${roomId}/read`, {});
    } catch (err) {
      console.error("Failed to load messages:", err);
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  }

  // Initial load when open
  useEffect(() => {
    if (!open) return;
    void loadRooms();
  }, [open, activeWorkspaceId]);

  useEffect(() => {
    if (!open || !activeRoomId) return;
    void loadMessages(activeRoomId);

    // Passive safety fallback polling (30s) in case of network disconnects
    const interval = setInterval(() => {
      void loadMessages(activeRoomId, true);
      void loadRooms();
    }, 30000);

    return () => clearInterval(interval);
  }, [open, activeRoomId]);

  // Real-time SSE Stream for instant messages and live read receipts
  useEffect(() => {
    if (!open) return;

    const source = new EventSource("/api/chat/stream");

    source.addEventListener("chat", (e) => {
      try {
        const event = JSON.parse(e.data);
        if (event.type === "new_message" && event.message) {
          const incomingMsg = event.message as ChatMessageDTO;
          if (incomingMsg.roomId === activeRoomId) {
            setMessages((prev) => {
              // Deduplicate if already present or replace temp
              const alreadyExists = prev.some((m) => m.id === incomingMsg.id);
              if (alreadyExists) return prev;
              const filtered = prev.filter(
                (m) => !(m.isPending && m.content === incomingMsg.content && m.senderId === incomingMsg.senderId),
              );
              return [...filtered, incomingMsg];
            });

            if (incomingMsg.senderId !== user.id) {
              playNotificationSound();
              sendDesktopNotification(`${incomingMsg.senderName} in ${activeRoomTitle}`, incomingMsg.content);
              void api.post(`/api/chat/rooms/${activeRoomId}/read`, {}).catch(() => {});
            }
          } else {
            // Notification for other room
            if (incomingMsg.senderId !== user.id) {
              playNotificationSound();
              sendDesktopNotification(`${incomingMsg.senderName}`, incomingMsg.content);
            }
          }
          void loadRooms();
        } else if (event.type === "read" && event.roomId === activeRoomId) {
          const readerUserId = event.userId;
          const readTimeMs = event.lastReadAt ? new Date(event.lastReadAt).getTime() : Date.now();
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.senderId === readerUserId) return msg;
              const msgTimeMs = new Date(msg.createdAt).getTime();
              if (readTimeMs >= msgTimeMs) {
                const currentReaders = msg.readers ?? [];
                if (!currentReaders.some((r) => r.id === readerUserId)) {
                  const readerUser = allStaff.find((s) => s.id === readerUserId);
                  const updatedReaders = [
                    ...currentReaders,
                    {
                      id: readerUserId,
                      name: readerUser?.name ?? "Staff",
                      photoUrl: readerUser?.photoUrl ?? null,
                      color: readerUser?.color ?? "#00BFB3",
                      readAt: event.lastReadAt || new Date().toISOString(),
                    },
                  ];
                  const isAllRead =
                    msg.totalMembers ? updatedReaders.length >= msg.totalMembers : true;
                  return { ...msg, readers: updatedReaders, isAllRead };
                }
              }
              return msg;
            }),
          );
        }
      } catch (err) {
        console.error("Error processing chat SSE event:", err);
      }
    });

    return () => {
      source.close();
    };
  }, [open, activeRoomId, activeRoomTitle, allStaff, user.id]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  // Close reader popover on outside click
  useEffect(() => {
    function handleClickOutside() {
      if (readerPopoverId) setReaderPopoverId(null);
    }
    if (readerPopoverId) {
      window.addEventListener("click", handleClickOutside);
      return () => window.removeEventListener("click", handleClickOutside);
    }
  }, [readerPopoverId]);

  // Start or open a DM with a staff member or volunteer
  async function handleOpenDirectMessage(targetStaffId: string, staffName: string) {
    if (targetStaffId === user.id) return;
    try {
      const res = await api.post<{ roomId: string }>("/api/chat/rooms", {
        targetUserId: targetStaffId,
      });
      setActiveRoomId(res.roomId);
      setActiveRoomTitle(staffName);
      const targetUser = allStaff.find((s) => s.id === targetStaffId);
      setActiveOtherUser(
        targetUser
          ? {
              id: targetUser.id,
              name: targetUser.name,
              email: targetUser.email,
              isOnline: targetUser.isOnline,
              userType: targetUser.userType,
            }
          : null,
      );
      await loadRooms();
      await loadMessages(res.roomId);
    } catch (err) {
      console.error("Failed to open DM:", err);
    }
  }

  // Instant 0ms Optimistic Message Sending
  async function handleSendMessage(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const text = inputText.trim();
    if (!text || !activeRoomId || sending) return;

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const optimisticMsg: ChatMessageDTO = {
      id: tempId,
      roomId: activeRoomId,
      senderId: user.id,
      senderName: user.name,
      senderColor: user.color,
      senderPhotoUrl: user.photoUrl ?? null,
      content: text,
      createdAt: new Date().toISOString(),
      readers: [],
      isAllRead: false,
      totalMembers: 1,
      isPending: true,
    };

    // 1. Instantly render in UI and clear text box (0ms)
    setMessages((prev) => [...prev, optimisticMsg]);
    setInputText("");
    setSending(true);

    try {
      const res = await api.post<{ message: ChatMessageDTO }>(
        `/api/chat/rooms/${activeRoomId}/messages`,
        { content: text },
      );
      // Replace optimistic message with actual persisted message
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...res.message, isPending: false } : m)),
      );
      void loadRooms();
    } catch (err) {
      console.error("Failed to send message:", err);
      // Remove temp message if failed and restore text
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInputText(text);
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleDriveFileSelect(item: { name: string; url: string }) {
    const driveLink = `[${item.name}](${item.url})`;
    setInputText((prev) => (prev ? `${prev}\n${driveLink}` : driveLink));
    inputRef.current?.focus();
  }

  if (!open) return null;

  const filteredStaff = allStaff.filter(
    (s) =>
      s.id !== user.id &&
      (s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.email.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  const staffSection = filteredStaff.filter((s) => s.userType !== "volunteer");
  const volunteerSection = filteredStaff.filter((s) => s.userType === "volunteer");

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={`${styles.drawer} ${mobileView === "list" ? styles.showList : styles.showChat}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar Channel List */}
        <div className={styles.channelList}>
          <div className={styles.channelHeader}>
            <div className={styles.channelTitle}>
              <span>Staff & Volunteer Chat</span>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={onClose}
                title="Close chat"
                aria-label="Close chat"
              >
                <CloseIcon size={14} />
              </button>
            </div>
            <input
              type="text"
              className={styles.staffSearch}
              placeholder="Search people to chat..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className={styles.channelScroll}>
            {/* Organization & Workspace Channels */}
            <div className={styles.sectionLabel}>Channels</div>
            {globalRoom && (
              <button
                type="button"
                className={`${styles.roomBtn} ${activeRoomId === globalRoom.id ? styles.roomBtnActive : ""}`}
                onClick={() => {
                  setActiveRoomId(globalRoom.id);
                  setActiveRoomTitle("All Staff");
                  setActiveOtherUser(null);
                  setMobileView("chat");
                }}
              >
                <div className={styles.roomIconWrap}>#</div>
                <div className={styles.roomInfo}>
                  <div className={styles.roomNameRow}>
                    <span className={styles.roomName}>All Staff (Global)</span>
                    {globalRoom.unreadCount > 0 && (
                      <span className={styles.unreadBadge}>{globalRoom.unreadCount}</span>
                    )}
                  </div>
                  {globalRoom.lastMessage && (
                    <div className={styles.roomSnippet}>
                      {globalRoom.lastMessage.senderName}: {globalRoom.lastMessage.content}
                    </div>
                  )}
                </div>
              </button>
            )}

            {workspaceRooms.map((wsRoom) => (
              <button
                key={wsRoom.id}
                type="button"
                className={`${styles.roomBtn} ${activeRoomId === wsRoom.id ? styles.roomBtnActive : ""}`}
                onClick={() => {
                  setActiveRoomId(wsRoom.id);
                  setActiveRoomTitle(wsRoom.name);
                  setActiveOtherUser(null);
                  setMobileView("chat");
                }}
              >
                <div className={styles.roomIconWrap}>🏢</div>
                <div className={styles.roomInfo}>
                  <div className={styles.roomNameRow}>
                    <span className={styles.roomName}>{wsRoom.name}</span>
                    {wsRoom.unreadCount > 0 && (
                      <span className={styles.unreadBadge}>{wsRoom.unreadCount}</span>
                    )}
                  </div>
                  {wsRoom.lastMessage && (
                    <div className={styles.roomSnippet}>
                      {wsRoom.lastMessage.senderName}: {wsRoom.lastMessage.content}
                    </div>
                  )}
                </div>
              </button>
            ))}

            {/* Direct Messages */}
            <div className={styles.sectionLabel} style={{ marginTop: 12 }}>
              Direct Messages
            </div>

            {/* Existing Active DMs */}
            {!searchQuery &&
              directRooms.map((dm) => {
                const isActive = activeRoomId === dm.id;
                const isVolunteer = dm.otherUser?.userType === "volunteer";
                return (
                  <button
                    key={dm.id}
                    type="button"
                    className={`${styles.roomBtn} ${isActive ? styles.roomBtnActive : ""}`}
                    onClick={() => {
                      setActiveRoomId(dm.id);
                      setActiveRoomTitle(dm.name);
                      setActiveOtherUser(
                        dm.otherUser
                          ? {
                              id: dm.otherUser.id,
                              name: dm.otherUser.name,
                              email: dm.otherUser.email,
                              isOnline: dm.otherUser.isOnline,
                              userType: dm.otherUser.userType,
                            }
                          : null,
                      );
                      setMobileView("chat");
                    }}
                  >
                    <div className={styles.avatarWrapper}>
                      <Avatar
                        name={dm.name}
                        color={dm.otherUser?.color ?? "#4285f4"}
                        size={26}
                        photoUrl={dm.otherUser?.photoUrl}
                      />
                      <span className={dm.otherUser?.isOnline ? styles.onlineBadge : styles.offlineBadge} />
                    </div>
                    <div className={styles.roomInfo}>
                      <div className={styles.roomNameRow}>
                        <span className={styles.roomName}>
                          {dm.name}
                          {isVolunteer && <span className={styles.volunteerTag}>Volunteer</span>}
                        </span>
                        {dm.unreadCount > 0 && (
                          <span className={styles.unreadBadge}>{dm.unreadCount}</span>
                        )}
                      </div>
                      {dm.lastMessage && (
                        <div className={styles.roomSnippet}>{dm.lastMessage.content}</div>
                      )}
                    </div>
                  </button>
                );
              })}

            {/* People list for new DM */}
            {(searchQuery || directRooms.length === 0) && (
              <div>
                {staffSection.length > 0 && (
                  <>
                    <div className={styles.sectionLabel} style={{ marginTop: 8 }}>
                      Staff ({staffSection.length})
                    </div>
                    {staffSection.map((staff) => (
                      <button
                        key={staff.id}
                        type="button"
                        className={styles.roomBtn}
                        onClick={() => {
                          handleOpenDirectMessage(staff.id, staff.name);
                          setMobileView("chat");
                        }}
                      >
                        <div className={styles.avatarWrapper}>
                          <Avatar
                            name={staff.name}
                            color={staff.color}
                            size={24}
                            photoUrl={staff.photoUrl}
                          />
                          <span className={staff.isOnline ? styles.onlineBadge : styles.offlineBadge} />
                        </div>
                        <div className={styles.roomInfo}>
                          <span className={styles.roomName}>{staff.name}</span>
                          <div className={styles.roomSnippet}>{staff.email}</div>
                        </div>
                      </button>
                    ))}
                  </>
                )}

                {volunteerSection.length > 0 && (
                  <>
                    <div className={styles.sectionLabel} style={{ marginTop: 12, color: "#a855f7" }}>
                      Volunteers ({volunteerSection.length})
                    </div>
                    {volunteerSection.map((vol) => (
                      <button
                        key={vol.id}
                        type="button"
                        className={styles.roomBtn}
                        onClick={() => {
                          handleOpenDirectMessage(vol.id, vol.name);
                          setMobileView("chat");
                        }}
                      >
                        <div className={styles.avatarWrapper}>
                          <Avatar
                            name={vol.name}
                            color={vol.color}
                            size={24}
                            photoUrl={vol.photoUrl}
                          />
                          <span className={vol.isOnline ? styles.onlineBadge : styles.offlineBadge} />
                        </div>
                        <div className={styles.roomInfo}>
                          <span className={styles.roomName}>
                            {vol.name}
                            <span className={styles.volunteerTag}>Volunteer</span>
                          </span>
                          <div className={styles.roomSnippet}>{vol.email}</div>
                        </div>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Chat Main Window */}
        <div className={styles.chatMain}>
          <div className={styles.chatHeader}>
            <div className={styles.headerTitleWrap}>
              <button
                type="button"
                className={styles.backBtn}
                onClick={() => setMobileView("list")}
                title="Back to channels"
                aria-label="Back to channels"
              >
                ← Channels
              </button>
              <div className={styles.headerInfo}>
                <span className={styles.headerTitle}>
                  {activeRoomTitle}
                  {activeOtherUser?.userType === "volunteer" && (
                    <span className={styles.volunteerTag}>Volunteer</span>
                  )}
                </span>
                <span className={styles.headerSub}>
                  {activeOtherUser ? (
                    activeOtherUser.isOnline ? (
                      <span style={{ display: "inline-flex", alignItems: "center" }}>
                        <span className={styles.onlineBullet} /> Online now
                      </span>
                    ) : (
                      <span style={{ display: "inline-flex", alignItems: "center" }}>
                        <span className={styles.offlineBullet} /> Offline
                      </span>
                    )
                  ) : activeRoomTitle === "All Staff" ? (
                    "Organization-wide channel"
                  ) : activeRoomTitle.includes("Workspace") ? (
                    "Workspace discussion"
                  ) : (
                    "Chat"
                  )}
                </span>
              </div>
            </div>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={onClose}
              title="Close chat"
              aria-label="Close chat"
            >
              <CloseIcon size={14} />
            </button>
          </div>

          <div className={styles.messageStream}>
            {loadingMessages && messages.length === 0 ? (
              <div className={styles.emptyState}>Loading messages...</div>
            ) : messages.length === 0 ? (
              <div className={styles.emptyState}>
                <div style={{ fontSize: "1.5rem", marginBottom: 8 }}>💬</div>
                <div>No messages yet in <strong>{activeRoomTitle}</strong>.</div>
                <div style={{ fontSize: "0.75rem", marginTop: 4 }}>
                  Say hello or attach a Google Drive document below!
                </div>
              </div>
            ) : (
              messages.map((msg) => {
                const isSelf = msg.senderId === user.id;
                const timeStr = new Date(msg.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });

                return (
                  <div
                    key={msg.id}
                    className={`${styles.messageRow} ${isSelf ? styles.messageRowSelf : ""}`}
                  >
                    {!isSelf && (
                      <Avatar
                        name={msg.senderName}
                        color={msg.senderColor}
                        size={28}
                        photoUrl={msg.senderPhotoUrl}
                      />
                    )}
                    <div className={styles.messageBubble}>
                      <div className={styles.messageHeader}>
                        <span className={styles.senderName}>{isSelf ? "You" : msg.senderName}</span>
                      </div>
                      <div className={styles.messageBody}>
                        <Markdown text={msg.content} />
                        <GoogleDriveCardList text={msg.content} />
                      </div>
                      <div className={styles.messageFooter}>
                        <span className={styles.messageTime}>{timeStr}</span>
                        {isSelf && (
                          <div
                            className={styles.readStatusContainer}
                            onClick={(e) => {
                              e.stopPropagation();
                              setReaderPopoverId(readerPopoverId === msg.id ? null : msg.id);
                            }}
                          >
                            <div
                              className={styles.readStatus}
                              title={
                                msg.isPending
                                  ? "Sending..."
                                  : msg.isAllRead
                                    ? `Read by all (${msg.readers?.length ?? 0})`
                                    : (msg.readers?.length ?? 0) > 0
                                      ? `Read by ${msg.readers!.map((r) => r.name).join(", ")}`
                                      : "Delivered (1 tick)"
                              }
                            >
                              {msg.isPending ? (
                                <span className={styles.tickPending}>⏳</span>
                              ) : msg.isAllRead ? (
                                <span className={styles.tickRead} aria-label="Read by all">
                                  ✓✓
                                </span>
                              ) : (msg.readers?.length ?? 0) > 0 ? (
                                <span className={styles.tickPartial} aria-label="Partially read">
                                  ✓<span className={styles.tickCount}>{msg.readers!.length}</span>
                                </span>
                              ) : (
                                <span className={styles.tickSent} aria-label="Sent">
                                  ✓
                                </span>
                              )}
                            </div>

                            {readerPopoverId === msg.id && (
                              <div
                                className={styles.readersTooltip}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className={styles.readersHeader}>
                                  {(msg.readers?.length ?? 0) > 0
                                    ? `Read by (${msg.readers!.length})`
                                    : "Status"}
                                </div>
                                {(msg.readers?.length ?? 0) > 0 ? (
                                  <div className={styles.readersList}>
                                    {msg.readers!.map((r) => (
                                      <div key={r.id} className={styles.readerItem}>
                                        <Avatar
                                          name={r.name}
                                          color={r.color}
                                          photoUrl={r.photoUrl}
                                          size={16}
                                        />
                                        <span className={styles.readerName}>{r.name}</span>
                                        <span className={styles.readerTime}>
                                          {new Date(r.readAt).toLocaleTimeString([], {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          })}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div style={{ color: "#94a3b8", fontSize: "0.6875rem" }}>
                                    Delivered · Not read yet
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Composer */}
          <div className={styles.composer}>
            <div className={styles.composerRow}>
              <textarea
                ref={inputRef}
                className={styles.textInput}
                placeholder={`Message ${activeRoomTitle}... (Shift+Enter for newline)`}
                rows={1}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />
              <button
                type="button"
                className={styles.sendBtn}
                onClick={handleSendMessage}
                disabled={sending || !inputText.trim()}
                title="Send message (Enter)"
              >
                <SendIcon size={14} />
              </button>
            </div>

            <div className={styles.composerTools}>
              <GooglePickerButton onFileSelect={handleDriveFileSelect} label="Drive Attachment" />
              <span className={styles.textHint}>
                Text & Google Drive only · No media files
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
