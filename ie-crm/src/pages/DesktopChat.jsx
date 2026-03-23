// DesktopChat — Standalone Houston desktop app
// Two-panel layout: channel list on left, messages on right
// Designed to run as its own installable Mac app via PWA

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ============================================================
// MESSAGE BUBBLE
// ============================================================
function MessageBubble({ message, isOwn }) {
  const isHouston = message.sender_type === 'houston';
  // Strip ACTION/NAV blocks from visible text
  const cleanBody = (message.body || '')
    .replace(/<!--ACTION:.*?-->/gs, '')
    .replace(/<!--NAV:.*?-->/gs, '')
    .trim();

  const attachments = Array.isArray(message.attachments)
    ? message.attachments
    : (typeof message.attachments === 'string' ? JSON.parse(message.attachments || '[]') : []);

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-3 px-4`}>
      {/* Avatar */}
      {!isOwn && (
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0 mr-3 mt-1"
          style={{ backgroundColor: isHouston ? HOUSTON_COLOR : (message.sender_color || DEFAULT_COLORS[0]) }}
        >
          {isHouston ? '\u26A1' : getInitials(message.sender_name)}
        </div>
      )}

      <div className={`max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}>
        {/* Sender name */}
        {!isOwn && (
          <div className="text-xs text-crm-muted mb-1 ml-1">
            {message.sender_name || 'Unknown'}
            <span className="ml-2 opacity-60">{formatTime(message.created_at)}</span>
          </div>
        )}

        {/* Attachments */}
        {attachments.length > 0 && attachments.map((att, i) => (
          att.type?.startsWith('image/') && (
            <img
              key={i}
              src={att.url}
              alt="attachment"
              className="max-w-full rounded-xl mb-1 max-h-64 object-cover"
            />
          )
        ))}

        {/* Message body */}
        {cleanBody && (
          <div className={`
            rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words
            ${isOwn
              ? 'bg-blue-600 text-white rounded-br-md'
              : isHouston
                ? 'bg-emerald-600/15 text-crm-text border border-emerald-500/30 rounded-bl-md'
                : 'bg-crm-card text-crm-text rounded-bl-md'
            }
          `}>
            {cleanBody}
          </div>
        )}

        {/* Time for own messages */}
        {isOwn && (
          <div className="text-[10px] text-crm-muted mt-1 mr-1 text-right">
            {formatTime(message.created_at)}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// CHANNEL LIST (Left Panel)
// ============================================================
function ChannelList({ channels, activeChannelId, onSelectChannel, userId }) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-4 border-b border-crm-border/50">
        <h1 className="text-lg font-semibold text-crm-text flex items-center gap-2">
          <span className="text-emerald-400">\u26A1</span> Houston
        </h1>
        <p className="text-xs text-crm-muted mt-0.5">Team Chat & AI Assistant</p>
      </div>

      {/* Channel items */}
      <div className="flex-1 overflow-y-auto py-2">
        {channels.map(ch => {
          const isActive = ch.id === activeChannelId;
          const isDM = ch.channel_type === 'houston_dm';
          const isCouncil = ch.channel_type === 'council';

          return (
            <button
              key={ch.id}
              onClick={() => onSelectChannel(ch.id)}
              className={`
                w-full px-4 py-3 flex items-center gap-3 text-left transition-colors
                ${isActive ? 'bg-crm-hover border-l-2 border-emerald-400' : 'hover:bg-crm-hover/50 border-l-2 border-transparent'}
              `}
            >
              <div className={`
                w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0
                ${isDM ? 'bg-emerald-600/20 text-emerald-400' : isCouncil ? 'bg-amber-600/20 text-amber-400' : 'bg-blue-600/20 text-blue-400'}
              `}>
                {isDM ? '\u26A1' : isCouncil ? '\uD83C\uDFDB' : '#'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-crm-text truncate">
                  {isDM ? 'Houston Direct' : ch.name || 'Channel'}
                </div>
                <div className="text-xs text-crm-muted truncate">
                  {isDM ? '1-on-1 with Houston AI' : isCouncil ? 'Command Council' : 'Team conversation'}
                </div>
              </div>
              {ch.unread_count > 0 && (
                <span className="bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                  {ch.unread_count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* User info footer */}
      <div className="px-4 py-3 border-t border-crm-border/50">
        <div className="text-xs text-crm-muted">Mudge Team CRE</div>
      </div>
    </div>
  );
}

// ============================================================
// MESSAGE INPUT
// ============================================================
function MessageInput({ onSend, onUpload }) {
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);
  const fileRef = useRef(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await onUpload(file);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="px-4 py-3 border-t border-crm-border/50">
      <div className="flex items-end gap-2 bg-crm-hover/50 rounded-2xl px-3 py-2 border border-crm-border/50">
        {/* File attachment */}
        <button
          onClick={() => fileRef.current?.click()}
          className="text-crm-muted hover:text-crm-text transition-colors p-1"
          disabled={uploading}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.pdf,.csv,.xlsx,.json,.txt"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Text input */}
        <textarea
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message..."
          rows={1}
          className="flex-1 bg-transparent text-crm-text text-sm placeholder-crm-muted resize-none outline-none max-h-32"
          style={{ minHeight: '24px' }}
        />

        {/* Send button */}
        {text.trim() && (
          <button
            onClick={handleSend}
            className="text-emerald-400 hover:text-emerald-300 transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// MAIN DESKTOP CHAT
// ============================================================
export default function DesktopChat() {
  const { user } = useAuth();
  const [channels, setChannels] = useState([]);
  const [activeChannelId, setActiveChannelId] = useState(null);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);

  const userId = user?.user_id;
  const { messages, sendMessage, sendFile, connected } = useChat(userId, activeChannelId);

  // Load channels on mount
  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      try {
        await seedChannels();
        const chs = await fetchChannels(userId);
        // Get Houston DM channel
        const dmCh = await fetchHoustonDmChannel(userId);

        // Sort: Houston DM first, then General, then rest
        const sorted = [...chs].sort((a, b) => {
          if (a.id === dmCh?.id) return -1;
          if (b.id === dmCh?.id) return 1;
          if (a.name === 'General') return -1;
          if (b.name === 'General') return 1;
          return 0;
        });

        setChannels(sorted);
        // Default to Houston DM
        if (sorted.length > 0) {
          setActiveChannelId(dmCh?.id || sorted[0].id);
        }
      } catch (err) {
        console.error('Failed to load channels:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback((text) => {
    if (text && activeChannelId) {
      sendMessage(text);
    }
  }, [activeChannelId, sendMessage]);

  const handleUpload = useCallback(async (file) => {
    if (activeChannelId) {
      await sendFile(file);
    }
  }, [activeChannelId, sendFile]);

  const activeChannel = channels.find(c => c.id === activeChannelId);
  const isDM = activeChannel?.channel_type === 'houston_dm';

  if (loading) {
    return (
      <div className="h-screen bg-crm-bg flex items-center justify-center">
        <div className="text-crm-muted text-sm">Loading Houston...</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-crm-bg flex overflow-hidden">
      {/* Left panel — Channel list */}
      <div className="w-72 bg-crm-sidebar border-r border-crm-border/50 flex-shrink-0">
        <ChannelList
          channels={channels}
          activeChannelId={activeChannelId}
          onSelectChannel={setActiveChannelId}
          userId={userId}
        />
      </div>

      {/* Right panel — Messages */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Channel header */}
        <div className="px-5 py-3 border-b border-crm-border/50 flex items-center gap-3">
          <div className={`
            w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold
            ${isDM ? 'bg-emerald-600/20 text-emerald-400' : 'bg-blue-600/20 text-blue-400'}
          `}>
            {isDM ? '\u26A1' : '#'}
          </div>
          <div>
            <div className="text-sm font-semibold text-crm-text">
              {isDM ? 'Houston Direct' : activeChannel?.name || 'Select a channel'}
            </div>
            <div className="text-[10px] text-crm-muted">
              {connected
                ? isDM ? 'Houston is online' : `${channels.length} channels`
                : 'Connecting...'
              }
            </div>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto py-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-crm-muted">
                <div className="text-3xl mb-2">\u26A1</div>
                <div className="text-sm">
                  {isDM ? 'Start a conversation with Houston' : 'No messages yet'}
                </div>
              </div>
            </div>
          )}
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isOwn={msg.sender_id === userId}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <MessageInput onSend={handleSend} onUpload={handleUpload} />
      </div>
    </div>
  );
}
