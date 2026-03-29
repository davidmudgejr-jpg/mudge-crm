// Telegram-style chat bubble — edge-to-edge layout
// Gradient outgoing, glass incoming, timestamps inside bubble
// Robot avatar for Houston, grouped clustering

import React from 'react';
import { View, Text, Image, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import type { Message } from '../hooks/useChat';

const HOUSTON_AVATAR = require('../assets/images/icon.png');

interface Props {
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  showName: boolean;
  isLastInGroup: boolean;
  isNew?: boolean;
}

export function shouldShowAvatar(messages: Message[], msg: Message, index: number): boolean {
  if (index === 0) return true;
  const prev = messages[index - 1];
  if (!prev) return true;
  if (prev.sender_id !== msg.sender_id) return true;
  const gap = new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime();
  return gap > 5 * 60 * 1000;
}

export function isLastInGroup(messages: Message[], msg: Message, index: number): boolean {
  if (index === messages.length - 1) return true;
  const next = messages[index + 1];
  if (!next) return true;
  if (next.sender_id !== msg.sender_id) return true;
  const gap = new Date(next.created_at).getTime() - new Date(msg.created_at).getTime();
  return gap > 5 * 60 * 1000;
}

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
  return d.toLocaleDateString([], { month: 'long', day: 'numeric' });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

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

function MessageBubbleInner({ message, isOwn, showAvatar, showName, isLastInGroup: lastInGroup }: Omit<Props, 'isNew'>) {
  const isHouston = message.sender_type === 'houston';
  const hasImage = message.message_type === 'image' && message.attachments?.length > 0;

  // Tail corners — Telegram style
  const ownRadii = lastInGroup
    ? { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 4, borderBottomLeftRadius: 18 }
    : { borderRadius: 18 };
  const otherRadii = lastInGroup
    ? { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 18, borderBottomLeftRadius: 4 }
    : { borderRadius: 18 };

  // Timestamp + read receipts inline at bottom-right
  const meta = (
    <View style={s.metaRow}>
      <Text style={[s.time, isOwn && s.timeOwn]}>{formatTime(message.created_at)}</Text>
      {isOwn && <Text style={s.readReceipt}>✓✓</Text>}
    </View>
  );

  const inner = (
    <>
      {showName && !isOwn && (
        <Text style={[s.sender, isHouston && s.houstonSender]}>
          {isHouston ? 'Houston' : message.sender_name}
        </Text>
      )}
      {hasImage && (
        <Image source={{ uri: message.attachments[0].url }} style={s.image} resizeMode="cover" />
      )}
      {message.body ? (
        <View style={s.textWithMeta}>
          {renderText(message.body, isOwn)}
          {meta}
        </View>
      ) : (
        meta
      )}
    </>
  );

  return (
    <View style={[
      s.row,
      isOwn ? s.rowOwn : s.rowOther,
      showAvatar && { marginTop: 8 },
      !lastInGroup && { marginBottom: 1 },
    ]}>
      {/* Avatar — only on last message in group */}
      {!isOwn && lastInGroup ? (
        isHouston ? (
          <Image source={HOUSTON_AVATAR} style={s.avatarImage} />
        ) : (
          <View style={s.avatar}>
            <Text style={s.avatarText}>{getInitials(message.sender_name || '?')}</Text>
          </View>
        )
      ) : !isOwn ? (
        <View style={s.avatarSpace} />
      ) : null}

      {isOwn ? (
        <LinearGradient
          colors={['#2D7CF6', '#5856D6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[s.bubble, s.bubbleOwn, ownRadii]}
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

export default function MessageBubble(props: Props) {
  const { isNew, ...rest } = props;

  if (isNew) {
    return (
      <Animated.View entering={FadeIn.duration(150)}>
        <MessageBubbleInner {...rest} />
      </Animated.View>
    );
  }

  return <MessageBubbleInner {...rest} />;
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginHorizontal: 8, // Tight — 8px from edges like Telegram
    marginBottom: 2,
  },
  rowOwn: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#2c2c2e',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    alignSelf: 'flex-end',
  },
  avatarImage: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: 6,
    alignSelf: 'flex-end',
  },
  avatarText: { fontSize: 11, fontWeight: '600', color: '#e5e5e5' },
  avatarSpace: { width: 36 }, // avatar width + margin
  bubble: {
    maxWidth: '85%', // Wider — Telegram style
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  bubbleOwn: {
    // gradient applied via LinearGradient
  },
  bubbleOther: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  bubbleHouston: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderColor: 'rgba(16,185,129,0.08)',
  },
  sender: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
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
  textWithMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    gap: 3,
    alignSelf: 'flex-end',
    paddingTop: 2,
  },
  time: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
  },
  timeOwn: {
    color: 'rgba(255,255,255,0.55)',
  },
  readReceipt: {
    fontSize: 11,
    color: 'rgba(100,180,255,0.7)',
  },
  image: {
    width: 240,
    height: 240,
    borderRadius: 14,
    marginBottom: 4,
  },
  dateSepWrap: {
    alignItems: 'center',
    marginVertical: 10,
  },
  dateSepPill: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  dateSepText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.5)',
  },
});
