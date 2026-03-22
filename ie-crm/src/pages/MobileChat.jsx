// MobileChat — iMessage-style full-screen chat for PWA
// Two modes: Team Chat + Houston Direct (1-on-1)

import React, { useState, useEffect, useRef } from 'react';
import { useChat, fetchChannels, seedChannels, uploadFile, fetchHoustonDmChannel } from '../hooks/useChat';
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
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ── iMessage-style Bubble ──
function Bubble({ message, isOwn, showAvatar, showName, onImageClick }) {
  const isHouston = message.sender_type === 'houston';

  const attachments = Array.isArray(message.attachments)
    ? message.attachments
    : (typeof message.attachments === 'string' ? JSON.parse(message.attachments || '[]') : []);

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${showAvatar ? 'mt-3' : 'mt-0.5'}`}>
      {/* Avatar — only for others, only on first message in group */}
      {!isOwn && showAvatar && (
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 mr-2 mt-auto"
          style={{ backgroundColor: isHouston ? HOUSTON_COLOR : (message.sender_color || DEFAULT_COLORS[0]) }}
        >
          {isHouston ? '\u26A1' : getInitials(message.sender_name)}
        </div>
      )}
      {!isOwn && !showAvatar && <div className="w-8 mr-2 flex-shrink-0" />}

      <div className={`max-w-[78%] flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
        {/* Sender name */}
        {!isOwn && showName && (
          <span className={`text-[11px] mb-1 ml-1 font-medium ${isHouston ? 'text-emerald-500' : 'text-crm-muted'}`}>
            {isHouston ? '\u26A1 Houston' : message.sender_name}
          </span>
        )}

        {/* Image attachments */}
        {attachments.map((att, i) => (
          att.mime_type?.startsWith('image/') ? (
            <img
              key={i}
              src={att.url}
              alt={att.filename}
              className="max-w-full rounded-[18px] mb-0.5"
              onClick={() => onImageClick?.(att)}
            />
          ) : (
            <div key={i} className="flex items-center gap-2 bg-crm-hover rounded-[18px] px-4 py-2.5 mb-0.5 text-sm">
              <span className="text-crm-muted">&#128206;</span>
              <span className="text-crm-text truncate text-[15px]">{att.filename}</span>
            </div>
          )
        ))}

        {/* Message body */}
        {message.body && (
          <div className={`px-4 py-2 rounded-[20px] text-[16px] leading-[22px] whitespace-pre-wrap break-words ${
            isOwn
              ? 'bg-[#007AFF] text-white rounded-br-[6px]'
              : isHouston
                ? 'bg-emerald-500/15 text-crm-text rounded-bl-[6px]'
                : 'bg-crm-hover text-crm-text rounded-bl-[6px]'
          }`}>
            {message.body}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Typing dots ──
function TypingDots({ users }) {
  if (!users.length) return null;
  return (
    <div className="flex items-center gap-2 mt-2 ml-10">
      <div className="bg-crm-hover rounded-[20px] px-4 py-2.5 flex items-center gap-1">
        <span className="w-2 h-2 bg-crm-muted/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 bg-crm-muted/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 bg-crm-muted/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}

// ── Main Page ──
export default function MobileChat() {
  const { user } = useAuth();
  const [teamChannelId, setTeamChannelId] = useState(null);
  const [houstonChannelId, setHoustonChannelId] = useState(null);
  const [mode, setMode] = useState('team'); // 'team' | 'houston'
  const activeChannelId = mode === 'houston' ? houstonChannelId : teamChannelId;
  const [imagePreview, setImagePreview] = useState(null);
  const [text, setText] = useState('');
  const [viewportHeight, setViewportHeight] = useState('100dvh');
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingRef = useRef(false);
  const typingTimer = useRef(null);

  // Track visual viewport to handle keyboard resize (iOS)
  useEffect(() => {
    if (!window.visualViewport) return;
    const onResize = () => {
      setViewportHeight(window.visualViewport.height + 'px');
      // Scroll input into view when keyboard opens
      setTimeout(() => inputRef.current?.scrollIntoView?.({ block: 'nearest' }), 100);
    };
    window.visualViewport.addEventListener('resize', onResize);
    window.visualViewport.addEventListener('scroll', onResize);
    return () => {
      window.visualViewport.removeEventListener('resize', onResize);
      window.visualViewport.removeEventListener('scroll', onResize);
    };
  }, []);

  const {
    messages, typingUsers, connected, loading,
    loadingOlder, hasOlder, loadOlderMessages,
    sendMessage, sendTyping, stopTyping, markRead,
  } = useChat(user?.user_id, activeChannelId);

  // Load both channels on mount
  useEffect(() => {
    if (!user?.user_id) return;
    (async () => {
      try {
        await seedChannels();
        const chs = await fetchChannels(user.user_id);
        const teamCh = chs.find(c => c.channel_type === 'group');
        if (teamCh) setTeamChannelId(teamCh.id);
      } catch (err) {
        console.error('[MobileChat] Failed to load team channels:', err);
      }
      try {
        const { channelId: houstonId } = await fetchHoustonDmChannel(user.user_id);
        setHoustonChannelId(houstonId);
      } catch (err) {
        console.error('[MobileChat] Failed to load Houston DM:', err);
      }
    })();
  }, [user?.user_id]);

  // Reset scroll state when channel changes
  const initialScrollDone = useRef(false);
  useEffect(() => {
    initialScrollDone.current = false;
    prevMsgCount.current = 0;
    setScrollReady(false);
  }, [activeChannelId]);

  // Auto-scroll
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
  useEffect(() => { if (activeChannelId) markRead(); }, [activeChannelId, messages.length]);

  // Image preview state
  const [pendingImage, setPendingImage] = useState(null); // { file, previewUrl }
  const [uploading, setUploading] = useState(false);

  // Send — handles text and pending images
  const handleSend = async () => {
    const trimmed = text.trim();

    // If there's a pending image, upload and send it
    if (pendingImage) {
      setUploading(true);
      try {
        const att = await uploadFile(pendingImage.file);
        sendMessage(trimmed || '', { messageType: 'image', attachments: [att] });
      } catch (err) {
        console.error('[MobileChat] Upload failed:', err);
      } finally {
        setUploading(false);
        URL.revokeObjectURL(pendingImage.previewUrl);
        setPendingImage(null);
        setText('');
        typingRef.current = false;
        stopTyping();
        clearTimeout(typingTimer.current);
        inputRef.current?.focus();
      }
      return;
    }

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
    if (!typingRef.current) { typingRef.current = true; sendTyping(user?.display_name); }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => { typingRef.current = false; stopTyping(); }, 2000);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (file.type.startsWith('image/')) {
      const previewUrl = URL.createObjectURL(file);
      setPendingImage({ file, previewUrl });
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      // Non-images upload immediately
      (async () => {
        try {
          const att = await uploadFile(file);
          sendMessage(file.name, { messageType: 'file', attachments: [att] });
        } catch (err) {
          console.error('[MobileChat] Upload failed:', err);
        }
      })();
    }
  };

  const cancelImage = () => {
    if (pendingImage) {
      URL.revokeObjectURL(pendingImage.previewUrl);
      setPendingImage(null);
    }
  };

  // Handle paste for images
  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const previewUrl = URL.createObjectURL(file);
          setPendingImage({ file, previewUrl });
        }
        return;
      }
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

  // Messages come from the active channel — no filtering needed
  const displayMessages = messages;

  return (
    <div className="flex flex-col bg-crm-bg text-crm-text" style={{ height: viewportHeight }}>
      {/* ── Header ── */}
      <div className="flex-shrink-0 bg-crm-bg/90 backdrop-blur-xl border-b border-crm-border/20" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center justify-between px-4 py-2">
          <div className="w-12" /> {/* Spacer */}
          <div className="text-center">
            <h1 className="text-[15px] font-semibold">
              {mode === 'houston' ? '\u26A1 Houston' : 'Team Chat'}
            </h1>
            <div className="flex items-center justify-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
              <span className="text-[10px] text-crm-muted">
                {connected ? (mode === 'houston' ? 'Online' : 'Houston online') : 'Reconnecting...'}
              </span>
            </div>
          </div>
          <div className="w-12" /> {/* Spacer for centering */}
        </div>

        {/* Mode toggle */}
        <div className="flex px-4 pb-2 gap-1">
          <button
            onClick={() => { setMode('team'); }}
            className={`flex-1 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
              mode === 'team'
                ? 'bg-crm-accent text-white'
                : 'bg-crm-hover text-crm-muted'
            }`}
          >
            Team
          </button>
          <button
            onClick={() => { setMode('houston'); }}
            className={`flex-1 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
              mode === 'houston'
                ? 'bg-emerald-500 text-white'
                : 'bg-crm-hover text-crm-muted'
            }`}
          >
            {'\u26A1'} Houston
          </button>
        </div>
      </div>

      {/* ── Messages ── */}
      <div
        ref={chatContainerRef}
        className={`flex-1 overflow-y-auto px-3 py-2 ${scrollReady || loading || displayMessages.length === 0 ? '' : 'invisible'}`}
      >
        {loadingOlder && (
          <div className="flex justify-center py-3">
            <svg className="w-5 h-5 animate-spin text-crm-muted" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}
        {!hasOlder && displayMessages.length > 0 && (
          <div className="text-center py-4">
            <span className="text-[11px] text-crm-muted/40">Beginning of conversation</span>
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-crm-muted text-sm">Loading...</div>
          </div>
        ) : displayMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-10">
            <div className="text-5xl mb-4">{mode === 'houston' ? '\u26A1' : '\uD83D\uDCAC'}</div>
            <h2 className="text-lg font-semibold mb-2">
              {mode === 'houston' ? 'Ask Houston anything' : 'Team Chat'}
            </h2>
            <p className="text-sm text-crm-muted leading-relaxed">
              {mode === 'houston'
                ? 'Deals, properties, contacts, comps — Houston has your entire CRM in his brain. Drop screenshots and he\'ll read them too.'
                : 'Chat with your team. Houston is listening and will jump in when he has something useful.'}
            </p>
          </div>
        ) : (
          displayMessages.map((msg, idx) => (
            <Bubble
              key={msg.id}
              message={msg}
              isOwn={msg.sender_id === user?.user_id}
              showAvatar={shouldShowAvatar(msg, idx)}
              showName={shouldShowAvatar(msg, idx)}
              onImageClick={setImagePreview}
            />
          ))
        )}
        <TypingDots users={typingUsers} />
        <div ref={messagesEndRef} />
      </div>

      {/* ── Image preview strip ── */}
      {pendingImage && (
        <div className="px-3 pt-2 pb-1 flex-shrink-0">
          <div className="relative inline-block">
            <img
              src={pendingImage.previewUrl}
              alt="Preview"
              className="h-24 rounded-2xl border border-crm-border/40 object-cover"
            />
            <button
              onClick={cancelImage}
              className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-sm font-bold hover:bg-red-400 transition-colors shadow-sm"
            >
              &times;
            </button>
            {uploading && (
              <div className="absolute inset-0 bg-black/40 rounded-2xl flex items-center justify-center">
                <svg className="w-6 h-6 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Input bar ── */}
      <div className="flex items-end gap-1.5 px-2 py-1 flex-shrink-0" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 4px)' }}>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-9 h-9 flex items-center justify-center text-crm-accent rounded-full flex-shrink-0 mb-0.5"
        >
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
            <path stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" d="M12 8v8M8 12h8" />
          </svg>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
          onChange={handleFileChange}
        />
        <div className="flex-1 min-h-[36px] rounded-full border border-crm-border/40 flex items-end overflow-hidden">
          <textarea
            ref={inputRef}
            value={text}
            onChange={handleChange}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            onPaste={handlePaste}
            placeholder={pendingImage ? 'Add a caption...' : (mode === 'houston' ? 'Ask Houston...' : 'Message...')}
            rows={1}
            className="flex-1 bg-transparent text-[16px] text-crm-text placeholder-crm-muted/50 px-4 py-2 resize-none outline-none max-h-24 leading-[20px]"
            style={{ minHeight: '36px', WebkitAppearance: 'none' }}
          />
        </div>
        {(text.trim() || pendingImage) ? (
          <button
            onClick={handleSend}
            disabled={uploading}
            className={`w-9 h-9 flex items-center justify-center rounded-full flex-shrink-0 mb-0.5 active:scale-90 transition-transform ${uploading ? 'bg-crm-muted/30 text-crm-muted' : 'bg-crm-accent text-white'}`}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25H13.5a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
            </svg>
          </button>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-9 h-9 flex items-center justify-center text-crm-muted/40 rounded-full flex-shrink-0 mb-0.5"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        )}
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
