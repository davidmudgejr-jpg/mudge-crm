// MobileChat — Full-screen chat for PWA / mobile
// Houston AI team chat, optimized for phone screens
// No CRM tables — just chat. Houston answers everything.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useChat, fetchChannels, seedChannels, uploadFile } from '../hooks/useChat';
import { useAuth } from '../contexts/AuthContext';

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

// ── Chat Bubble ──
function ChatBubble({ message, isOwn, showAvatar, onImageClick }) {
  const isHouston = message.sender_type === 'houston';
  const bubbleColor = isOwn
    ? 'bg-blue-600 text-white'
    : isHouston
      ? 'bg-emerald-600/15 text-crm-text border border-emerald-500/30'
      : 'bg-crm-card text-crm-text';

  const attachments = Array.isArray(message.attachments)
    ? message.attachments
    : (typeof message.attachments === 'string' ? JSON.parse(message.attachments || '[]') : []);

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-1.5 group`}>
      {!isOwn && showAvatar && (
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0 mr-2.5 mt-auto"
          style={{ backgroundColor: isHouston ? HOUSTON_COLOR : (message.sender_color || DEFAULT_COLORS[0]) }}
        >
          {isHouston ? '\u26A1' : getInitials(message.sender_name)}
        </div>
      )}
      {!isOwn && !showAvatar && <div className="w-9 mr-2.5 flex-shrink-0" />}

      <div className={`max-w-[80%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
        {!isOwn && showAvatar && (
          <span className={`text-xs mb-0.5 ml-1 ${isHouston ? 'text-emerald-400 font-medium' : 'text-crm-muted'}`}>
            {isHouston ? '\u26A1 Houston' : message.sender_name}
          </span>
        )}

        {attachments.length > 0 && attachments.map((att, i) => (
          att.mime_type?.startsWith('image/') ? (
            <img
              key={i}
              src={att.url}
              alt={att.filename}
              className="max-w-full rounded-2xl mb-1 cursor-pointer"
              onClick={() => onImageClick?.(att)}
            />
          ) : (
            <div key={i} className="flex items-center gap-2 bg-crm-card/50 rounded-lg px-3 py-2.5 mb-1 text-sm">
              <svg className="w-5 h-5 text-crm-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              <span className="text-crm-text truncate">{att.filename}</span>
            </div>
          )
        ))}

        {message.body && (
          <div className={`px-4 py-2.5 rounded-2xl ${bubbleColor} ${isOwn ? 'rounded-br-md' : 'rounded-bl-md'} text-[15px] leading-relaxed whitespace-pre-wrap break-words`}>
            {message.body}
          </div>
        )}

        <span className="text-[10px] text-crm-muted/40 opacity-0 group-hover:opacity-100 active:opacity-100 transition-opacity mt-0.5 mx-1">
          {formatTime(message.created_at)}
        </span>
      </div>
    </div>
  );
}

// ── Typing Indicator ──
function TypingIndicator({ users }) {
  if (!users.length) return null;
  const names = users.map(u => u.displayName).join(', ');
  return (
    <div className="flex items-center gap-2 px-4 py-2 text-xs text-crm-muted">
      <div className="flex gap-0.5">
        <span className="w-1.5 h-1.5 bg-crm-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 bg-crm-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 bg-crm-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <span>{names} typing...</span>
    </div>
  );
}

// ── Main MobileChat Page ──
export default function MobileChat() {
  const { user } = useAuth();
  const [channels, setChannels] = useState([]);
  const [activeChannelId, setActiveChannelId] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [text, setText] = useState('');
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingRef = useRef(false);
  const typingTimer = useRef(null);

  const {
    messages, typingUsers, connected, loading,
    loadingOlder, hasOlder, loadOlderMessages,
    sendMessage, sendTyping, stopTyping, markRead,
  } = useChat(user?.user_id, activeChannelId);

  // Load channels
  useEffect(() => {
    if (!user?.user_id) return;
    (async () => {
      try {
        await seedChannels();
        const chs = await fetchChannels(user.user_id);
        setChannels(chs);
        if (chs.length > 0 && !activeChannelId) setActiveChannelId(chs[0].id);
      } catch (err) {
        console.error('[MobileChat] Failed to load channels:', err);
      }
    })();
  }, [user?.user_id]);

  // Auto-scroll to bottom
  const prevMsgCount = useRef(0);
  const [scrollReady, setScrollReady] = useState(false);
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container || messages.length === 0) return;

    if (prevMsgCount.current === 0) {
      container.scrollTop = container.scrollHeight;
      setScrollReady(true);
      prevMsgCount.current = messages.length;
      return;
    }

    if (messages.length > prevMsgCount.current) {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
      if (isNearBottom) container.scrollTop = container.scrollHeight;
    }
    prevMsgCount.current = messages.length;
  }, [messages]);

  // Scroll to load older
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      if (container.scrollTop < 80 && hasOlder && !loadingOlder) loadOlderMessages();
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [hasOlder, loadingOlder, loadOlderMessages]);

  // Mark as read
  useEffect(() => {
    if (activeChannelId) markRead();
  }, [activeChannelId, messages.length]);

  // Send message
  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    sendMessage(trimmed);
    setText('');
    typingRef.current = false;
    stopTyping();
    clearTimeout(typingTimer.current);
    inputRef.current?.focus();
  };

  const handleChange = (e) => {
    setText(e.target.value);
    if (!typingRef.current) {
      typingRef.current = true;
      sendTyping(user?.display_name);
    }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => { typingRef.current = false; stopTyping(); }, 2000);
  };

  // File upload
  const handleFileSelect = async (file) => {
    try {
      const attachment = await uploadFile(file);
      const isImage = file.type.startsWith('image/');
      sendMessage(isImage ? '' : `\uD83D\uDCCE ${file.name}`, {
        messageType: isImage ? 'image' : 'file',
        attachments: [attachment]
      });
    } catch (err) {
      console.error('[MobileChat] Upload failed:', err);
    }
  };

  function shouldShowAvatar(msg, idx) {
    if (idx === 0) return true;
    const prev = messages[idx - 1];
    if (!prev) return true;
    if (msg.sender_type !== prev.sender_type) return true;
    if (msg.sender_id !== prev.sender_id) return true;
    return (new Date(msg.created_at) - new Date(prev.created_at)) > 5 * 60 * 1000;
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-crm-bg text-crm-text" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-crm-border/30 bg-crm-bg/90 backdrop-blur-xl flex-shrink-0">
        <div className="flex items-center gap-3">
          <a href="#/" className="p-1 -ml-1 text-crm-muted hover:text-crm-text">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </a>
          <div className="flex -space-x-2">
            <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-bold text-white ring-2 ring-crm-bg">
              {'\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67'}
            </div>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white ring-2 ring-crm-bg" style={{ backgroundColor: HOUSTON_COLOR }}>
              {'\u26A1'}
            </div>
          </div>
          <div>
            <h1 className="text-base font-semibold">Team Chat</h1>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
              <span className="text-[11px] text-crm-muted">
                {connected ? 'Houston listening' : 'Reconnecting...'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={chatContainerRef}
        className={`flex-1 overflow-y-auto px-4 py-4 space-y-0.5 ${scrollReady || loading || messages.length === 0 ? '' : 'invisible'}`}
      >
        {loadingOlder && (
          <div className="flex justify-center py-3">
            <svg className="w-5 h-5 animate-spin text-crm-muted" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}
        {!hasOlder && messages.length > 0 && (
          <div className="text-center py-4">
            <span className="text-xs text-crm-muted/40">Beginning of conversation</span>
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-crm-muted">Loading...</div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="text-5xl mb-4">{'\u26A1'}</div>
            <h2 className="text-lg font-semibold mb-2">Houston is ready</h2>
            <p className="text-sm text-crm-muted">
              Ask Houston anything about your CRM — deals, properties, contacts, comps. Drop screenshots and he'll read them.
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <ChatBubble
              key={msg.id}
              message={msg}
              isOwn={msg.sender_id === user?.user_id}
              showAvatar={shouldShowAvatar(msg, idx)}
              onImageClick={setImagePreview}
            />
          ))
        )}
        <TypingIndicator users={typingUsers} />
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="flex items-end gap-2 px-3 py-2 border-t border-crm-border/30 bg-crm-bg/90 backdrop-blur-xl flex-shrink-0" style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-2.5 text-crm-muted hover:text-crm-text rounded-full"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
          onChange={(e) => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); e.target.value = ''; }}
        />

        <div className="flex-1 bg-crm-card/60 rounded-2xl border border-crm-border/30 focus-within:border-crm-accent/40 transition-colors overflow-hidden">
          <textarea
            ref={inputRef}
            value={text}
            onChange={handleChange}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Message Houston..."
            rows={1}
            className="w-full bg-transparent text-[15px] text-crm-text placeholder-crm-muted/50 px-4 py-2.5 resize-none outline-none max-h-32 rounded-2xl"
            style={{ minHeight: '42px', WebkitAppearance: 'none' }}
          />
        </div>

        <button
          onClick={handleSend}
          disabled={!text.trim()}
          className={`p-2.5 rounded-full transition-all ${
            text.trim()
              ? 'bg-blue-600 text-white hover:bg-blue-500'
              : 'bg-crm-card/40 text-crm-muted/30'
          }`}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m0 0l-7 7m7-7l7 7" />
          </svg>
        </button>
      </div>

      {/* Image preview */}
      {imagePreview && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={() => setImagePreview(null)}>
          <img src={imagePreview.url} alt={imagePreview.filename} className="max-w-[95vw] max-h-[90vh] rounded-lg" />
        </div>
      )}
    </div>
  );
}
