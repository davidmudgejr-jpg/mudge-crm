// useChat — Socket.io real-time chat hook
// Manages connection, messages, typing indicators, and unread counts

import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

// In dev, Vite proxy handles /api and /socket.io → localhost:3001
// In prod, same origin (Railway serves both)
// Socket.io: empty/undefined = connect to current page origin
const SOCKET_URL = import.meta.env.VITE_API_URL || undefined;

let socket = null;

function getSocket() {
  if (!socket) {
    const token = localStorage.getItem('crm-auth-token');
    socket = io(SOCKET_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      auth: { token },
    });
  }
  return socket;
}

export function useChat(userId, channelId) {
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(true); // assume there are older messages until proven otherwise
  const typingTimeouts = useRef({});

  // Connect and join channel
  useEffect(() => {
    if (!userId || !channelId) return;

    const sock = getSocket();

    if (!sock.connected) {
      sock.connect();
    }

    const onConnect = () => {
      setConnected(true);
      sock.emit('chat:join', { channelId, userId });
    };

    const onDisconnect = () => setConnected(false);

    const onNewMessage = (msg) => {
      setMessages(prev => {
        // Deduplicate (in case of reconnect replay)
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };

    const onMessageEdited = (msg) => {
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, ...msg } : m));
    };

    const onMessageDeleted = ({ messageId }) => {
      setMessages(prev => prev.filter(m => m.id !== messageId));
    };

    const onTyping = ({ userId: uid, displayName, channelId: cid }) => {
      if (cid !== channelId || uid === userId) return;
      setTypingUsers(prev => {
        if (prev.some(t => t.userId === uid)) return prev;
        return [...prev, { userId: uid, displayName }];
      });
      // Auto-clear after 3s
      clearTimeout(typingTimeouts.current[uid]);
      typingTimeouts.current[uid] = setTimeout(() => {
        setTypingUsers(prev => prev.filter(t => t.userId !== uid));
      }, 3000);
    };

    const onTypingStop = ({ userId: uid }) => {
      setTypingUsers(prev => prev.filter(t => t.userId !== uid));
      clearTimeout(typingTimeouts.current[uid]);
    };

    const onReactionNew = ({ messageId, userId: uid, emoji }) => {
      setMessages(prev => prev.map(m => {
        if (m.id !== messageId) return m;
        const reactions = Array.isArray(m.reactions) ? [...m.reactions] : [];
        reactions.push({ emoji, user_id: uid });
        return { ...m, reactions };
      }));
    };

    const onReactionRemoved = ({ messageId, userId: uid, emoji }) => {
      setMessages(prev => prev.map(m => {
        if (m.id !== messageId) return m;
        const reactions = (Array.isArray(m.reactions) ? m.reactions : [])
          .filter(r => !(r.emoji === emoji && r.user_id === uid));
        return { ...m, reactions };
      }));
    };

    sock.on('connect', onConnect);
    sock.on('disconnect', onDisconnect);
    sock.on('chat:message:new', onNewMessage);
    sock.on('chat:message:edited', onMessageEdited);
    sock.on('chat:message:deleted', onMessageDeleted);
    sock.on('chat:typing', onTyping);
    sock.on('chat:typing:stop', onTypingStop);
    sock.on('chat:reaction:new', onReactionNew);
    sock.on('chat:reaction:removed', onReactionRemoved);

    if (sock.connected) {
      onConnect();
    }

    // Fetch initial messages via REST
    setHasOlder(true);
    fetchMessages(channelId, userId).then(msgs => {
      setMessages(msgs);
      setLoading(false);
      // If we got fewer than 50, there are no older messages
      if (msgs.length < 50) setHasOlder(false);
    }).catch(err => {
      console.error('[useChat] Failed to fetch messages:', err);
      setLoading(false);
    });

    return () => {
      sock.off('connect', onConnect);
      sock.off('disconnect', onDisconnect);
      sock.off('chat:message:new', onNewMessage);
      sock.off('chat:message:edited', onMessageEdited);
      sock.off('chat:message:deleted', onMessageDeleted);
      sock.off('chat:typing', onTyping);
      sock.off('chat:typing:stop', onTypingStop);
      sock.off('chat:reaction:new', onReactionNew);
      sock.off('chat:reaction:removed', onReactionRemoved);
      Object.values(typingTimeouts.current).forEach(clearTimeout);
    };
  }, [userId, channelId]);

  // Load older messages (cursor-based pagination)
  const loadOlderMessages = useCallback(async () => {
    if (!channelId || !userId || loadingOlder || !hasOlder) return;
    if (messages.length === 0) return;

    setLoadingOlder(true);
    try {
      const oldestMessage = messages[0];
      const olderMsgs = await fetchMessages(channelId, userId, {
        before: oldestMessage.created_at,
        limit: 50,
      });

      if (olderMsgs.length === 0) {
        setHasOlder(false);
      } else {
        // Prepend older messages, deduplicate
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const newOlder = olderMsgs.filter(m => !existingIds.has(m.id));
          return [...newOlder, ...prev];
        });
        if (olderMsgs.length < 50) setHasOlder(false);
      }
    } catch (err) {
      console.error('[useChat] Failed to load older messages:', err);
    } finally {
      setLoadingOlder(false);
    }
  }, [channelId, userId, messages, loadingOlder, hasOlder]);

  // Send a message
  const sendMessage = useCallback((body, { messageType = 'text', attachments = [], replyToId = null } = {}) => {
    const sock = getSocket();
    sock.emit('chat:message', {
      channelId,
      senderId: userId,
      senderType: 'user',
      body,
      messageType,
      attachments,
      replyToId,
    });
  }, [channelId, userId]);

  // Send typing indicator
  const sendTyping = useCallback((displayName) => {
    const sock = getSocket();
    sock.emit('chat:typing', { channelId, userId, displayName });
  }, [channelId, userId]);

  const stopTyping = useCallback(() => {
    const sock = getSocket();
    sock.emit('chat:typing:stop', { channelId, userId });
  }, [channelId, userId]);

  // Mark channel as read
  const markRead = useCallback(() => {
    const sock = getSocket();
    sock.emit('chat:read', { channelId, userId });
  }, [channelId, userId]);

  // Add reaction
  const addReaction = useCallback((messageId, emoji) => {
    const sock = getSocket();
    sock.emit('chat:react', { messageId, userId, emoji });
  }, [userId]);

  // Remove reaction
  const removeReaction = useCallback((messageId, emoji) => {
    const sock = getSocket();
    sock.emit('chat:react:remove', { messageId, userId, emoji });
  }, [userId]);

  // Edit message
  const editMessage = useCallback((messageId, newBody) => {
    const sock = getSocket();
    sock.emit('chat:edit', { messageId, userId, newBody });
  }, [userId]);

  // Delete message
  const deleteMessage = useCallback((messageId) => {
    const sock = getSocket();
    sock.emit('chat:delete', { messageId, userId });
  }, [userId]);

  return {
    messages,
    typingUsers,
    connected,
    loading,
    loadingOlder,
    hasOlder,
    loadOlderMessages,
    sendMessage,
    sendTyping,
    stopTyping,
    markRead,
    addReaction,
    removeReaction,
    editMessage,
    deleteMessage,
  };
}

// ── REST helpers ──

function authHeaders() {
  const token = localStorage.getItem('crm-auth-token');
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

const API_BASE = import.meta.env.VITE_API_URL || '';

async function fetchMessages(channelId, userId, { before = null, limit = 50 } = {}) {
  let url = `${API_BASE}/api/chat/messages/${channelId}?userId=${userId}&limit=${limit}`;
  if (before) url += `&before=${encodeURIComponent(before)}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch messages');
  return res.json();
}

export async function fetchChannels(userId) {
  const res = await fetch(`${API_BASE}/api/chat/channels?userId=${userId}`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Failed to fetch channels');
  return res.json();
}

export async function seedChannels() {
  const res = await fetch(`${API_BASE}/api/chat/seed`, {
    method: 'POST',
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Failed to seed channels');
  return res.json();
}

export async function uploadFile(file) {
  const token = localStorage.getItem('crm-auth-token');
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/api/chat/upload`, {
    method: 'POST',
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) throw new Error('Upload failed');
  return res.json();
}

export async function fetchUnreadCount(userId) {
  const res = await fetch(`${API_BASE}/api/chat/unread?userId=${userId}`, {
    headers: authHeaders()
  });
  if (!res.ok) return { unread: 0 };
  return res.json();
}

export async function fetchHoustonDmChannel(userId) {
  const res = await fetch(`${API_BASE}/api/chat/houston-dm?userId=${userId}`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Failed to get Houston DM channel');
  return res.json();
}
