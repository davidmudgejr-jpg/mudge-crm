// Chat hook — port of web useChat.js for React Native
// Same Socket.io events + REST API calls, adapted for RN state management

import { useState, useEffect, useRef, useCallback } from 'react';
import { getSocket, getSocketInstance } from '../lib/socket';
import { apiGet, apiPost, apiFetch, API_BASE } from '../lib/api';

export interface Message {
  id: string;
  channel_id: string;
  sender_id: string | null;
  sender_type: 'user' | 'houston';
  sender_name: string;
  sender_color?: string;
  body: string;
  message_type: string;
  attachments: Array<{ url: string; filename: string; mime_type?: string }>;
  houston_meta?: any;
  reply_to_id?: string;
  created_at: string;
  edited_at?: string;
  deleted_at?: string;
}

export interface Channel {
  id: string;
  name: string;
  channel_type: 'group' | 'houston_dm' | 'council';
  created_by: string;
  last_activity: string;
  unread_count?: number;
}

interface ChatState {
  messages: Message[];
  typingUsers: Array<{ userId: string; displayName: string }>;
  connected: boolean;
  loading: boolean;
  loadingOlder: boolean;
  hasOlder: boolean;
  error: string | null;
}

// Message cache per channel — prevents flash when switching
const messageCache = new Map<string, Message[]>();

export function useChat(userId: string | undefined, channelId: string | null) {
  const [state, setState] = useState<ChatState>({
    messages: [],
    typingUsers: [],
    connected: false,
    loading: true,
    loadingOlder: false,
    hasOlder: true,
    error: null,
  });

  const socketRef = useRef<any>(null);
  const prevChannelRef = useRef<string | null>(null);

  // Connect socket + join channel
  useEffect(() => {
    if (!userId || !channelId) {
      // No channel yet — don't show spinner forever
      setState((s) => ({ ...s, loading: !channelId ? true : s.loading }));
      return;
    }

    let mounted = true;

    // Safety timeout — never spin forever
    const timeout = setTimeout(() => {
      if (mounted) {
        setState((s) => s.loading ? ({ ...s, loading: false, error: 'Load timed out' }) : s);
      }
    }, 8000);

    (async () => {
      try {
        // Fetch messages first (don't wait for socket)
        const cached = messageCache.get(channelId);
        if (cached?.length) {
          setState((s) => ({ ...s, messages: cached, loading: false, error: null }));
        }

        try {
          const url = `/api/chat/messages/${channelId}?limit=50`;
          const res = await apiFetch(url);
          const data = await res.json();
          if (mounted) {
            const msgs = Array.isArray(data) ? data : (data.messages || []);
            const sorted = msgs.sort(
              (a: Message, b: Message) =>
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
            messageCache.set(channelId, sorted);
            setState((s) => ({
              ...s,
              messages: sorted,
              loading: false,
              error: null,
              hasOlder: data.hasMore ?? sorted.length >= 50,
            }));
          }
        } catch (fetchErr: any) {
          console.warn('[useChat] Message fetch failed:', fetchErr);
          if (mounted) setState((s) => ({ ...s, loading: false, error: `Fetch failed: ${fetchErr.message}` }));
        }

        // Connect socket separately
        const socket = await getSocket();
        socketRef.current = socket;

        if (mounted) setState((s) => ({ ...s, connected: socket.connected }));

        socket.on('connect', () => {
          if (mounted) setState((s) => ({ ...s, connected: true }));
        });
        socket.on('disconnect', () => {
          if (mounted) setState((s) => ({ ...s, connected: false }));
        });

        // Join channel
        socket.emit('chat:join', { channelId });

        // Listen for new messages
        socket.on('chat:message:new', (msg: Message) => {
          if (msg.channel_id !== channelId) return;
          if (mounted) {
            setState((s) => {
              // Dedup
              if (s.messages.some((m) => m.id === msg.id)) return s;
              const updated = [...s.messages, msg];
              messageCache.set(channelId, updated);
              return { ...s, messages: updated };
            });
          }
        });

        socket.on('chat:message:edited', (msg: Message) => {
          if (msg.channel_id !== channelId) return;
          if (mounted) {
            setState((s) => ({
              ...s,
              messages: s.messages.map((m) => (m.id === msg.id ? msg : m)),
            }));
          }
        });

        socket.on('chat:message:deleted', (msg: { id: string }) => {
          if (mounted) {
            setState((s) => ({
              ...s,
              messages: s.messages.filter((m) => m.id !== msg.id),
            }));
          }
        });

        // Typing indicators
        socket.on('chat:typing', (data: { userId: string; displayName: string; channelId: string }) => {
          if (data.channelId !== channelId || data.userId === userId) return;
          if (mounted) {
            setState((s) => {
              if (s.typingUsers.some((u) => u.userId === data.userId)) return s;
              return { ...s, typingUsers: [...s.typingUsers, { userId: data.userId, displayName: data.displayName }] };
            });
          }
        });

        socket.on('chat:typing:stop', (data: { userId: string; channelId: string }) => {
          if (data.channelId !== channelId) return;
          if (mounted) {
            setState((s) => ({
              ...s,
              typingUsers: s.typingUsers.filter((u) => u.userId !== data.userId),
            }));
          }
        });
      } catch (err) {
        console.error('[useChat] Setup error:', err);
        if (mounted) setState((s) => ({ ...s, loading: false }));
      }
    })();

    return () => {
      mounted = false;
      clearTimeout(timeout);
      const socket = getSocketInstance();
      if (socket) {
        socket.off('chat:message:new');
        socket.off('chat:message:edited');
        socket.off('chat:message:deleted');
        socket.off('chat:typing');
        socket.off('chat:typing:stop');
        socket.off('connect');
        socket.off('disconnect');
      }
    };
  }, [userId, channelId]);

  // Send message
  const sendMessage = useCallback(
    (body: string, opts?: { messageType?: string; attachments?: any[] }) => {
      const socket = getSocketInstance();
      if (!socket || !channelId || !userId) return;
      socket.emit('chat:message', {
        channelId,
        senderId: userId,
        senderType: 'user',
        body,
        messageType: opts?.messageType || 'text',
        attachments: opts?.attachments || [],
        replyToId: null,
      });
    },
    [channelId, userId]
  );

  // Typing indicators
  const sendTyping = useCallback(
    (displayName?: string) => {
      const socket = getSocketInstance();
      if (!socket || !channelId) return;
      socket.emit('chat:typing', { channelId, displayName });
    },
    [channelId]
  );

  const stopTyping = useCallback(() => {
    const socket = getSocketInstance();
    if (!socket || !channelId) return;
    socket.emit('chat:typing:stop', { channelId });
  }, [channelId]);

  // Mark read
  const markRead = useCallback(() => {
    const socket = getSocketInstance();
    if (!socket || !channelId) return;
    socket.emit('chat:read', { channelId });
  }, [channelId]);

  // Load older messages (cursor pagination)
  const loadOlderMessages = useCallback(async () => {
    if (!channelId || state.loadingOlder || !state.hasOlder || state.messages.length === 0) return;
    setState((s) => ({ ...s, loadingOlder: true }));
    try {
      const oldest = state.messages[0];
      const res = await apiGet<{ messages: Message[]; hasMore: boolean }>(
        `/api/chat/messages/${channelId}?limit=30&before=${oldest.created_at}`
      );
      const older = res.messages || res;
      const sorted = (Array.isArray(older) ? older : []).sort(
        (a: Message, b: Message) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      setState((s) => {
        const combined = [...sorted, ...s.messages];
        messageCache.set(channelId, combined);
        return {
          ...s,
          messages: combined,
          loadingOlder: false,
          hasOlder: res.hasMore ?? sorted.length >= 30,
        };
      });
    } catch (err) {
      console.error('[useChat] Load older error:', err);
      setState((s) => ({ ...s, loadingOlder: false }));
    }
  }, [channelId, state.loadingOlder, state.hasOlder, state.messages]);

  return {
    ...state,
    sendMessage,
    sendTyping,
    stopTyping,
    markRead,
    loadOlderMessages,
  };
}

// ── Standalone API helpers (same as web) ──

export async function fetchChannels(userId: string): Promise<Channel[]> {
  return apiGet(`/api/chat/channels?userId=${userId}`);
}

export async function seedChannels(): Promise<void> {
  await apiPost('/api/chat/seed');
}

export async function fetchHoustonDmChannel(userId: string): Promise<{ channelId: string }> {
  return apiGet(`/api/chat/houston-dm?userId=${userId}`);
}

export async function uploadFile(uri: string, filename: string, mimeType: string) {
  const formData = new FormData();
  formData.append('file', {
    uri,
    name: filename,
    type: mimeType,
  } as any);

  const res = await apiFetch('/api/chat/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'multipart/form-data' } as any,
    body: formData as any,
  });

  if (!res.ok) throw new Error('Upload failed');
  return res.json();
}
