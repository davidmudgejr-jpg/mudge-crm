// Telegram-style chat bubble — gradient outgoing, dark incoming
// Consecutive bubble grouping: tail corner only on last in group

import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { Message } from '../hooks/useChat';

interface Props {
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  showName: boolean;
  isLastInGroup: boolean;  // tail corner only on last bubble in a consecutive group
}

// Determine if this message starts a new group (different sender or >5min gap)
export function shouldShowAvatar(messages: Message[], msg: Message, index: number): boolean {
  if (index === 0) return true;
  const prev = messages[index - 1];
  if (!prev) return true;
  if (prev.sender_id !== msg.sender_id) return true;
  const gap = new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime();
  return gap > 5 * 60 * 1000;
}

// Determine if this is the last message before a sender change or gap
export function isLastInGroup(messages: Message[], msg: Message, index: number): boolean {
  if (index === messages.length - 1) return true;
  const next = messages[index + 1];
  if (!next) return true;
  if (next.sender_id !== msg.sender_id) return true;
  const gap = new Date(next.created_at).getTime() - new Date(msg.created_at).getTime();
  return gap > 5 * 60 * 1000;
}

// Check if we need a date separator before this message
export function needsDateSeparator(messages: Message[], index: number): string | null {
  const msg = messages[index];
  if (index === 0) return formatDate(msg.created_at);
  const prev = messages[index - 1];
  const d1 = new Date(prev.created_at).toDateString();
  const d2 = new Date(msg.created_at).toDateString();
  if (d1 !== d2) return formatDate(msg.created_at);
  return null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

// Simple bold rendering
function renderText(text: string, isOwn: boolean) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  if (parts.length === 1) {
    return <Text style={[s.msgText, isOwn && s.ownText]}>{text}</Text>;
  }
  return (
    <Text style={[s.msgText, isOwn && s.ownText]}>
      {parts.map((p, i) =>
        i % 2 === 1 ? <Text key={i} style={s.bold}>{p}</Text> : <Text key={i}>{p}</Text>
      )}
    </Text>
  );
}

export function DateSeparator({ label }: { label: string }) {
  return (
    <View style={s.dateSepWrap}>
      <View style={s.dateSepPill}>
        <Text style={s.dateSepText}>{label}</Text>
      </View>
    </View>
  );
}

export default function MessageBubble({ message, isOwn, showAvatar, showName, isLastInGroup: lastInGroup }: Props) {
  const isHouston = message.sender_type === 'houston';
  const hasImage = message.message_type === 'image' && message.attachments?.length > 0;

  // Corner radii — tail only on last bubble in group
  const ownRadii = lastInGroup
    ? { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 4, borderBottomLeftRadius: 18 }
    : { borderRadius: 18 };
  const otherRadii = lastInGroup
    ? { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 18, borderBottomLeftRadius: 4 }
    : { borderRadius: 18 };

  const inner = (
    <>
      {showName && !isOwn && (
        <Text style={[s.sender, isHouston && s.houstonSender]}>
          {isHouston ? '⚡ Houston' : message.sender_name}
        </Text>
      )}
      {hasImage && (
        <Image source={{ uri: message.attachments[0].url }} style={s.image} resizeMode="cover" />
      )}
      {message.body ? renderText(message.body, isOwn) : null}
      {lastInGroup && (
        <Text style={[s.time, isOwn && s.timeOwn]}>{formatTime(message.created_at)}</Text>
      )}
    </>
  );

  return (
    <View style={[s.row, isOwn ? s.rowOwn : s.rowOther, showAvatar && { marginTop: 10 }]}>
      {/* Avatar — only on first message in group */}
      {!isOwn && lastInGroup ? (
        <View style={[s.avatar, isHouston && s.avatarHouston]}>
          <Text style={s.avatarText}>{isHouston ? '⚡' : getInitials(message.sender_name || '?')}</Text>
        </View>
      ) : !isOwn ? (
        <View style={s.avatarSpace} />
      ) : null}

      {isOwn ? (
        <LinearGradient
          colors={['#3B82F6', '#6366F1']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[s.bubble, ownRadii]}
        >
          {inner}
        </LinearGradient>
      ) : (
        <View style={[s.bubble, s.bubbleOther, isHouston && s.bubbleHouston, otherRadii]}>
          {inner}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginBottom: 2,
  },
  rowOwn: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3a3a3c',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    alignSelf: 'flex-end',
  },
  avatarHouston: { backgroundColor: 'rgba(16,185,129,0.2)' },
  avatarText: { fontSize: 11, fontWeight: '600', color: '#e5e5e5' },
  avatarSpace: { width: 34 },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  bubbleOther: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  bubbleHouston: {
    backgroundColor: 'rgba(16,185,129,0.1)',
  },
  sender: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 2,
  },
  houstonSender: { color: '#10b981' },
  msgText: {
    fontSize: 16,
    color: '#F5F5F7',
    lineHeight: 22,
  },
  ownText: { color: '#fff' },
  bold: { fontWeight: '700' },
  time: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 3,
  },
  timeOwn: {
    alignSelf: 'flex-end',
    color: 'rgba(255,255,255,0.5)',
  },
  image: {
    width: 220,
    height: 220,
    borderRadius: 14,
    marginBottom: 4,
  },
  dateSepWrap: {
    alignItems: 'center',
    marginVertical: 12,
  },
  dateSepPill: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  dateSepText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.45)',
  },
});
