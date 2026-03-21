// TeamChat — Draggable floating chat widget
// Real-time team messaging with Houston AI as 4th team member
// Non-blocking: stays open while using the CRM, draggable anywhere

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useChat, fetchChannels, seedChannels, uploadFile, fetchUnreadCount, fetchHoustonDmChannel } from '../hooks/useChat';
import { useAuth } from '../contexts/AuthContext';
import { useSlideOver } from './shared/SlideOverContext';

// ── Avatar colors for team members ──
const HOUSTON_COLOR = '#10b981';
const DEFAULT_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#14b8a6', '#8b5cf6'];

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatTime(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ============================================================
// CHAT BUBBLE — single message
// ============================================================
function ChatBubble({ message, isOwn, showAvatar, onReact, onImageClick }) {
  const isHouston = message.sender_type === 'houston';
  const bubbleColor = isOwn
    ? 'bg-blue-600 text-white'
    : isHouston
      ? 'bg-emerald-600/15 text-crm-text border border-emerald-500/30'
      : 'bg-crm-card text-crm-text';

  const reactions = Array.isArray(message.reactions) ? message.reactions : [];
  const attachments = Array.isArray(message.attachments)
    ? message.attachments
    : (typeof message.attachments === 'string' ? JSON.parse(message.attachments || '[]') : []);

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-1 group`}>
      {/* Avatar (left side for others) */}
      {!isOwn && showAvatar && (
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0 mr-2 mt-auto"
          style={{ backgroundColor: isHouston ? HOUSTON_COLOR : (message.sender_color || DEFAULT_COLORS[0]) }}
          title={message.sender_name}
        >
          {isHouston ? '\u26A1' : getInitials(message.sender_name)}
        </div>
      )}
      {!isOwn && !showAvatar && <div className="w-8 mr-2 flex-shrink-0" />}

      <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
        {/* Sender name (for others, when avatar shows) */}
        {!isOwn && showAvatar && (
          <span className={`text-[11px] mb-0.5 ml-1 ${isHouston ? 'text-emerald-400 font-medium' : 'text-crm-muted'}`}>
            {isHouston ? '\u26A1 Houston' : message.sender_name}
          </span>
        )}

        {/* Image attachments */}
        {attachments.length > 0 && attachments.map((att, i) => (
          att.mime_type?.startsWith('image/') ? (
            <img
              key={i}
              src={att.url}
              alt={att.filename}
              className="max-w-[280px] rounded-xl mb-1 cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => onImageClick?.(att)}
            />
          ) : (
            <div key={i} className="flex items-center gap-2 bg-crm-card/50 rounded-lg px-3 py-2 mb-1 text-sm">
              <svg className="w-4 h-4 text-crm-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              <span className="text-crm-text truncate">{att.filename}</span>
            </div>
          )
        ))}

        {/* Message body */}
        {message.body && (
          <div className={`px-3.5 py-2 rounded-2xl ${bubbleColor} ${isOwn ? 'rounded-br-md' : 'rounded-bl-md'} text-sm leading-relaxed whitespace-pre-wrap break-words`}>
            {message.body}
          </div>
        )}

        {/* Reactions */}
        {reactions.length > 0 && (
          <div className="flex gap-1 mt-0.5 ml-1">
            {Object.entries(
              reactions.reduce((acc, r) => {
                acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                return acc;
              }, {})
            ).map(([emoji, count]) => (
              <span key={emoji} className="text-xs bg-crm-card/60 rounded-full px-1.5 py-0.5 border border-crm-border/30">
                {emoji} {count > 1 ? count : ''}
              </span>
            ))}
          </div>
        )}

        {/* Timestamp (on hover) */}
        <span className="text-[10px] text-crm-muted/50 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 mx-1">
          {formatTime(message.created_at)}
          {message.edited_at && ' \u00B7 edited'}
        </span>
      </div>
    </div>
  );
}

// ============================================================
// TYPING INDICATOR — animated dots
// ============================================================
function TypingIndicator({ users }) {
  if (!users.length) return null;
  const names = users.map(u => u.displayName).join(', ');
  return (
    <div className="flex items-center gap-2 px-4 py-1 text-xs text-crm-muted">
      <div className="flex gap-0.5">
        <span className="w-1.5 h-1.5 bg-crm-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 bg-crm-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 bg-crm-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <span>{names} {users.length === 1 ? 'is' : 'are'} typing\u2026</span>
    </div>
  );
}

// ============================================================
// MESSAGE INPUT — text + file upload + send
// ============================================================
function MessageInput({ onSend, onTyping, onStopTyping, onFileSelect, displayName, placeholder = 'Message the team...' }) {
  const [text, setText] = useState('');
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingRef = useRef(false);
  const typingTimer = useRef(null);

  const handleChange = (e) => {
    setText(e.target.value);
    if (!typingRef.current) {
      typingRef.current = true;
      onTyping(displayName);
    }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      typingRef.current = false;
      onStopTyping();
    }, 2000);
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
    typingRef.current = false;
    onStopTyping();
    clearTimeout(typingTimer.current);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex items-end gap-2 px-3 py-2 border-t border-crm-border/30 bg-crm-bg/80 backdrop-blur-sm">
      {/* File upload button */}
      <button
        onClick={() => fileInputRef.current?.click()}
        className="p-2 text-crm-muted hover:text-crm-text transition-colors rounded-full hover:bg-crm-hover/50"
        title="Upload image or file"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
        </svg>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
        onChange={(e) => {
          if (e.target.files?.[0]) onFileSelect(e.target.files[0]);
          e.target.value = '';
        }}
      />

      {/* Text input */}
      <div className="flex-1 bg-crm-card/60 rounded-2xl border border-crm-border/30 focus-within:border-crm-accent/40 transition-colors overflow-hidden">
        <textarea
          ref={inputRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          className="w-full bg-transparent text-sm text-crm-text placeholder-crm-muted/50 px-4 py-2.5 resize-none outline-none max-h-32 rounded-2xl"
          style={{ minHeight: '38px', WebkitAppearance: 'none' }}
        />
      </div>

      {/* Send button */}
      <button
        onClick={handleSend}
        disabled={!text.trim()}
        className={`p-2 rounded-full transition-all ${
          text.trim()
            ? 'bg-blue-600 text-white hover:bg-blue-500 scale-100'
            : 'bg-crm-card/40 text-crm-muted/30 scale-95'
        }`}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m0 0l-7 7m7-7l7 7" />
        </svg>
      </button>
    </div>
  );
}

// ============================================================
// useDrag — reusable drag hook for the chat window
// ============================================================
function useDrag(initialPos) {
  const [position, setPosition] = useState(initialPos);
  const dragState = useRef({ dragging: false, startX: 0, startY: 0, startPosX: 0, startPosY: 0 });

  const onMouseDown = useCallback((e) => {
    // Only drag from the header bar, ignore buttons
    if (e.target.closest('button') || e.target.closest('textarea') || e.target.closest('input')) return;
    e.preventDefault();
    dragState.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      startPosX: position.x,
      startPosY: position.y,
    };

    const onMouseMove = (e) => {
      if (!dragState.current.dragging) return;
      const dx = e.clientX - dragState.current.startX;
      const dy = e.clientY - dragState.current.startY;
      setPosition({
        x: dragState.current.startPosX + dx,
        y: dragState.current.startPosY + dy,
      });
    };

    const onMouseUp = () => {
      dragState.current.dragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [position]);

  return { position, setPosition, onMouseDown };
}

// ============================================================
// useResize — corner-drag resize hook
// ============================================================
const MIN_W = 320;
const MIN_H = 300;
const DEFAULT_W = 400;
const DEFAULT_H = 600;

function useResize(initialSize) {
  const [size, setSize] = useState(initialSize);
  const resizeState = useRef({ resizing: false });

  const onResizeMouseDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    resizeState.current = {
      resizing: true,
      startX: e.clientX,
      startY: e.clientY,
      startW: size.w,
      startH: size.h,
    };

    const onMouseMove = (e) => {
      if (!resizeState.current.resizing) return;
      const dx = e.clientX - resizeState.current.startX;
      const dy = e.clientY - resizeState.current.startY;
      setSize({
        w: Math.max(MIN_W, resizeState.current.startW + dx),
        h: Math.max(MIN_H, resizeState.current.startH + dy),
      });
    };

    const onMouseUp = () => {
      resizeState.current.resizing = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [size]);

  return { size, setSize, onResizeMouseDown };
}

// ============================================================
// MAIN CHAT WIDGET — non-blocking, draggable
// ============================================================
export default function TeamChat({ isOpen, onClose }) {
  const { user } = useAuth();
  const { open: openSlideOver } = useSlideOver();
  const [teamChannelId, setTeamChannelId] = useState(null);
  const [houstonChannelId, setHoustonChannelId] = useState(null);
  const [mode, setMode] = useState('team'); // 'team' | 'houston'
  const activeChannelId = mode === 'houston' ? houstonChannelId : teamChannelId;
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [imagePreview, setImagePreview] = useState(null);
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [scrollReady, setScrollReady] = useState(false);
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);

  // Draggable position — starts bottom-right
  const { position, setPosition, onMouseDown } = useDrag({
    x: typeof window !== 'undefined' ? window.innerWidth - 420 : 800,
    y: typeof window !== 'undefined' ? window.innerHeight - 620 : 200,
  });

  // Resizable
  const { size, setSize, onResizeMouseDown } = useResize({ w: DEFAULT_W, h: DEFAULT_H });

  // Toggle expanded (near full-screen) mode
  const toggleExpanded = useCallback(() => {
    if (!expanded) {
      setPosition({ x: 80, y: 40 });
      setSize({
        w: (typeof window !== 'undefined' ? window.innerWidth : 1200) - 100,
        h: (typeof window !== 'undefined' ? window.innerHeight : 800) - 80,
      });
      setExpanded(true);
    } else {
      setPosition({
        x: (typeof window !== 'undefined' ? window.innerWidth : 1200) - 420,
        y: (typeof window !== 'undefined' ? window.innerHeight : 800) - 620,
      });
      setSize({ w: DEFAULT_W, h: DEFAULT_H });
      setExpanded(false);
    }
  }, [expanded, setPosition, setSize]);

  const {
    messages, typingUsers, connected, loading,
    loadingOlder, hasOlder, loadOlderMessages,
    sendMessage, sendTyping, stopTyping, markRead,
    addReaction, removeReaction
  } = useChat(user?.user_id, activeChannelId);

  // Load channels on mount
  useEffect(() => {
    if (!user?.user_id) return;
    loadChannels();
  }, [user?.user_id]);

  async function loadChannels() {
    // Load team and Houston channels separately so one failure doesn't block the other
    try {
      await seedChannels();
      const chs = await fetchChannels(user.user_id);
      // Find the group channel (not houston_dm)
      const teamCh = chs.find(c => c.channel_type === 'group');
      if (teamCh) setTeamChannelId(teamCh.id);
    } catch (err) {
      console.error('[TeamChat] Failed to load team channels:', err);
    }
    try {
      const { channelId: houstonId } = await fetchHoustonDmChannel(user.user_id);
      setHoustonChannelId(houstonId);
    } catch (err) {
      console.error('[TeamChat] Failed to load Houston DM channel:', err);
    }
  }

  // Reset scroll state when channel changes or chat opens/closes
  useEffect(() => {
    initialScrollDone.current = false;
    prevMsgCountRef.current = 0;
    setScrollReady(false);
  }, [activeChannelId]);

  // Auto-scroll to bottom on new messages (only if already near bottom)
  const prevMsgCountRef = useRef(0);
  const initialScrollDone = useRef(false);
  useEffect(() => {
    // Reset scroll tracking when chat closes
    if (!isOpen) {
      initialScrollDone.current = false;
      prevMsgCountRef.current = 0;
      setScrollReady(false);
      return;
    }

    const container = chatContainerRef.current;
    if (!container || messages.length === 0) return;

    // Initial load — set scroll position before making visible
    if (!initialScrollDone.current) {
      initialScrollDone.current = true;
      // Set scrollTop directly (no animation, no flash)
      container.scrollTop = container.scrollHeight;
      setScrollReady(true);
      prevMsgCountRef.current = messages.length;
      return;
    }

    if (messages.length > prevMsgCountRef.current) {
      const addedCount = messages.length - prevMsgCountRef.current;
      const firstNewMsg = messages[0];
      const wasLoadingOlder = addedCount > 1 && firstNewMsg?.created_at < (messages[addedCount]?.created_at || '');

      if (!wasLoadingOlder) {
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
        if (isNearBottom) {
          container.scrollTop = container.scrollHeight;
        }
      }
    }
    prevMsgCountRef.current = messages.length;
  }, [messages, isOpen]);

  // Detect scroll to top for loading older messages
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (container.scrollTop < 60 && hasOlder && !loadingOlder) {
        loadOlderMessages();
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [hasOlder, loadingOlder, loadOlderMessages]);

  // Mark as read when chat is open and active
  useEffect(() => {
    if (isOpen && activeChannelId) {
      markRead();
    }
  }, [isOpen, activeChannelId, messages.length]);

  // Execute NAV commands from Houston messages
  const lastNavRef = useRef(null);
  useEffect(() => {
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.sender_type !== 'houston') return;
    if (lastMsg.id === lastNavRef.current) return; // already handled

    const meta = typeof lastMsg.houston_meta === 'string'
      ? JSON.parse(lastMsg.houston_meta || '{}') : (lastMsg.houston_meta || {});

    if (!meta.nav_commands || meta.nav_commands.length === 0) return;
    lastNavRef.current = lastMsg.id;
    console.log('[TeamChat] Executing NAV commands:', meta.nav_commands);

    // Execute NAV commands with a short delay so user sees Houston's message first
    setTimeout(() => {
      for (const nav of meta.nav_commands) {
        executeNavCommand(nav);
      }
    }, 1500);
  }, [messages]);

  async function executeNavCommand(nav) {
    const API_BASE = import.meta.env.VITE_API_URL || '';
    const token = localStorage.getItem('crm-auth-token');
    const headers = token ? { 'Authorization': 'Bearer ' + token } : {};

    switch (nav.action) {
      case 'navigate':
        if (nav.params?.page) {
          window.location.hash = '#/' + nav.params.page;
        }
        break;

      case 'open_detail': {
        const et = nav.params?.entity_type;
        const search = nav.params?.search;
        if (!et || !search) break;

        // Map entity type to table and search column
        const tableMap = { property: 'properties', contact: 'contacts', company: 'companies', deal: 'deals' };
        const searchCol = { property: 'property_address', contact: 'full_name', company: 'company_name', deal: 'deal_name' };
        const idCol = { property: 'property_id', contact: 'contact_id', company: 'company_id', deal: 'deal_id' };
        const table = tableMap[et];
        const col = searchCol[et];
        const id = idCol[et];
        if (!table) break;

        try {
          // Try exact search first, then fuzzy (each word separately)
          let data;
          const res1 = await fetch(API_BASE + '/api/db/query', {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql: 'SELECT ' + id + ' FROM ' + table + ' WHERE ' + col + ' ILIKE $1 LIMIT 1', params: ['%' + search + '%'] }),
          });
          data = await res1.json();

          // If no exact match, try fuzzy: search by key words (skip numbers, short words)
          if (!data.rows?.length) {
            const words = search.replace(/[,\.]/g, '').split(/\s+/).filter(w => w.length > 2 && !/^\d+$/.test(w));
            if (words.length > 0) {
              const fuzzyWhere = words.map((_, i) => col + ' ILIKE $' + (i + 1)).join(' AND ');
              const fuzzyParams = words.map(w => '%' + w + '%');
              const res2 = await fetch(API_BASE + '/api/db/query', {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql: 'SELECT ' + id + ' FROM ' + table + ' WHERE ' + fuzzyWhere + ' LIMIT 1', params: fuzzyParams }),
              });
              data = await res2.json();
              console.log('[TeamChat] NAV fuzzy search:', words, '→', data.rows?.length, 'matches');
            }
          }

          console.log('[TeamChat] NAV search result:', data.rows?.length, 'matches for', search);
          if (data.rows?.[0]) {
            const entityId = data.rows[0][id];
            console.log('[TeamChat] Opening detail:', et, entityId);
            openSlideOver(et, entityId);
          } else {
            console.warn('[TeamChat] NAV: No matching record found for', search);
          }
        } catch (err) {
          console.error('[TeamChat] NAV open_detail failed:', err);
        }
        break;
      }

      case 'navigate_and_open': {
        if (nav.params?.page) {
          window.location.hash = '#/' + nav.params.page;
        }
        // Wait for page to load, then open detail
        if (nav.params?.entity_type && nav.params?.search) {
          setTimeout(() => executeNavCommand({ action: 'open_detail', params: nav.params }), 1000);
        }
        break;
      }

      case 'create_view': {
        if (nav.params?.page) {
          window.location.hash = '#/' + nav.params.page;
        }
        // Create view via API
        if (nav.params?.view_name && nav.params?.filters) {
          try {
            await fetch(API_BASE + '/api/views', {
              method: 'POST',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                entity_type: nav.params.page || 'properties',
                view_name: nav.params.view_name,
                filters: nav.params.filters,
                filter_logic: 'AND',
                sort_column: null,
                sort_direction: 'DESC',
                visible_columns: null,
                position: 99,
              }),
            });
            // Reload the page to pick up the new view
            setTimeout(() => window.location.reload(), 500);
          } catch (err) {
            console.error('[TeamChat] NAV create_view failed:', err);
          }
        }
        break;
      }

      default:
        console.warn('[TeamChat] Unknown NAV action:', nav.action);
    }
  }

  // Poll unread count
  useEffect(() => {
    if (!user?.user_id) return;
    const poll = async () => {
      try {
        const { unread } = await fetchUnreadCount(user.user_id);
        setUnreadTotal(unread);
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 15000);
    return () => clearInterval(interval);
  }, [user?.user_id]);

  // Handle file upload
  const handleFileSelect = async (file) => {
    try {
      const attachment = await uploadFile(file);
      const isImage = file.type.startsWith('image/');
      sendMessage(isImage ? '' : `\uD83D\uDCCE ${file.name}`, {
        messageType: isImage ? 'image' : 'file',
        attachments: [attachment]
      });
    } catch (err) {
      console.error('[TeamChat] Upload failed:', err);
    }
  };

  // Determine if we should show avatar
  function shouldShowAvatar(msg, idx) {
    if (idx === 0) return true;
    const prev = messages[idx - 1];
    if (!prev) return true;
    if (msg.sender_type !== prev.sender_type) return true;
    if (msg.sender_id !== prev.sender_id) return true;
    const gap = new Date(msg.created_at) - new Date(prev.created_at);
    return gap > 5 * 60 * 1000;
  }

  if (!isOpen) return null;

  return (
    <>
      {/* Chat panel — draggable, resizable, no backdrop, non-blocking */}
      <div
        className={`fixed z-[61] bg-crm-bg/80 backdrop-blur-xl backdrop-saturate-150 border border-crm-border/40 rounded-2xl shadow-2xl shadow-black/20 flex flex-col overflow-hidden ${minimized ? 'transition-[height,width] duration-200' : ''}`}
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: minimized ? '300px' : `${size.w}px`,
          height: minimized ? '48px' : `${size.h}px`,
          maxHeight: '95vh',
        }}
      >
        {/* Header — draggable handle */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b border-crm-border/30 bg-crm-bg/90 backdrop-blur-sm cursor-grab active:cursor-grabbing select-none flex-shrink-0"
          onMouseDown={onMouseDown}
        >
          <div className="flex items-center gap-2">
            {/* Mode toggle */}
            <div className="flex bg-crm-hover/60 rounded-full p-0.5">
              <button
                onClick={(e) => { e.stopPropagation(); setMode('team'); }}
                className={`px-3 py-1 rounded-full text-[11px] font-medium transition-colors ${
                  mode === 'team' ? 'bg-crm-accent text-white' : 'text-crm-muted'
                }`}
              >
                Team
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setMode('houston'); }}
                className={`px-3 py-1 rounded-full text-[11px] font-medium transition-colors ${
                  mode === 'houston' ? 'bg-emerald-500 text-white' : 'text-crm-muted'
                }`}
              >
                {'\u26A1'} Houston
              </button>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
                <span className="text-[10px] text-crm-muted">
                  {connected ? 'Houston online' : 'Reconnecting...'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* Minimize button */}
            <button
              onClick={() => setMinimized(m => !m)}
              className="p-1.5 rounded-full hover:bg-crm-hover/50 text-crm-muted hover:text-crm-text transition-colors"
              title={minimized ? 'Restore' : 'Minimize'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>
            {/* Expand / restore button */}
            <button
              onClick={toggleExpanded}
              className="p-1.5 rounded-full hover:bg-crm-hover/50 text-crm-muted hover:text-crm-text transition-colors"
              title={expanded ? 'Restore size' : 'Expand'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {expanded ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.5 3.5M15 9h4.5M15 9V4.5M15 9l5.5-5.5M9 15v4.5M9 15H4.5M9 15l-5.5 5.5M15 15h4.5M15 15v4.5m0-4.5l5.5 5.5" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                )}
              </svg>
            </button>
            {/* Close button */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-crm-hover/50 text-crm-muted hover:text-crm-text transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages area — hidden when minimized */}
        {!minimized && (
          <>
            <div ref={chatContainerRef} className={`flex-1 overflow-y-auto px-3 py-3 space-y-0.5 ${scrollReady || loading || messages.length === 0 ? '' : 'invisible'}`}>
              {/* Load older messages indicator */}
              {loadingOlder && (
                <div className="flex items-center justify-center py-3">
                  <div className="flex items-center gap-2 text-xs text-crm-muted">
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Loading older messages...
                  </div>
                </div>
              )}
              {!hasOlder && messages.length > 0 && (
                <div className="text-center py-3">
                  <span className="text-[10px] text-crm-muted/40">Beginning of conversation</span>
                </div>
              )}
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-crm-muted text-sm">Loading messages...</div>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-8">
                  <div className="text-4xl mb-3">{mode === 'houston' ? '\u26A1' : '\uD83D\uDCAC'}</div>
                  <h4 className="text-sm font-medium text-crm-text mb-1">
                    {mode === 'houston' ? 'Houston Direct' : 'Team Chat'}
                  </h4>
                  <p className="text-xs text-crm-muted">
                    {mode === 'houston'
                      ? 'Ask Houston anything — deals, properties, contacts, comps. He can also navigate the CRM, log activities, and create tasks for you.'
                      : 'Send a message to your team. Houston is listening and will chime in when he has something useful to add.'}
                  </p>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <ChatBubble
                    key={msg.id}
                    message={msg}
                    isOwn={msg.sender_id === user?.user_id}
                    showAvatar={shouldShowAvatar(msg, idx)}
                    onReact={(emoji) => addReaction(msg.id, emoji)}
                    onImageClick={setImagePreview}
                  />
                ))
              )}
              <TypingIndicator users={typingUsers} />
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <MessageInput
              onSend={(text) => sendMessage(text)}
              onTyping={sendTyping}
              onStopTyping={stopTyping}
              onFileSelect={handleFileSelect}
              displayName={user?.display_name}
              placeholder={mode === 'houston' ? 'Ask Houston...' : 'Message the team...'}
            />

            {/* Resize handle — bottom-right corner */}
            <div
              onMouseDown={onResizeMouseDown}
              className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize group"
              title="Drag to resize"
            >
              <svg className="w-3 h-3 text-crm-muted/30 group-hover:text-crm-muted/60 transition-colors absolute bottom-0.5 right-0.5" viewBox="0 0 10 10">
                <path d="M9 1L1 9M9 4L4 9M9 7L7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
          </>
        )}
      </div>

      {/* Image preview overlay */}
      {imagePreview && (
        <div
          className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center cursor-pointer"
          onClick={() => setImagePreview(null)}
        >
          <img
            src={imagePreview.url}
            alt={imagePreview.filename}
            className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl"
          />
        </div>
      )}
    </>
  );
}

// ============================================================
// CHAT TOGGLE BUTTON — shown in sidebar area
// ============================================================
export function ChatToggleButton({ onClick, unreadCount }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-4 right-4 z-[45] text-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg transition-all duration-200 hover:scale-110 hover:shadow-xl"
      style={{ background: 'linear-gradient(135deg, #007AFF, #AF52DE)', boxShadow: '0 4px 15px rgba(0,122,255,0.35)' }}
      title="Team Chat"
    >
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-1v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h1v4l4-4" />
      </svg>
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}
