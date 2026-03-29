// Houston Direct — 1-on-1 chat with Houston AI
//
// LAYERED ARCHITECTURE (back → front):
//   1. AnimatedBackground — full screen wallpaper
//   2. FlatList — absoluteFill, scrolls behind header + footer
//   3. ChatTogglePill (top) + Input pill (bottom) — position absolute, glass
//
// Messages scroll UNDER the glass overlays for blur-through effect.
// Input bar animated with keyboard via useReanimatedKeyboardAnimation.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Text,
  Pressable,
  Clipboard,
  Keyboard,
} from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';

import { useAuth } from '../../hooks/useAuth';
import { useChat, fetchHoustonDmChannel, uploadFile, type Message } from '../../hooks/useChat';
import MessageBubble, { shouldShowAvatar, isLastInGroup, needsDateSeparator, DateSeparator } from '../../components/MessageBubble';
import ChatInput from '../../components/ChatInput';
import TypingIndicator from '../../components/TypingIndicator';
import AnimatedBackground from '../../components/AnimatedBackground';
import ChatTogglePill from '../../components/ChatTogglePill';
import ScrollToBottomButton from '../../components/ScrollToBottomButton';
import MessageContextMenu from '../../components/MessageContextMenu';

const INPUT_BAR_HEIGHT = 52; // pill(38) + paddingTop(6) + paddingBottom(6) + hairline(2)

export default function HoustonScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [channelId, setChannelId] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);
  const initialCountRef = useRef<number | null>(null);

  const shouldScrollRef = useRef(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [unreadWhileScrolled, setUnreadWhileScrolled] = useState(0);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuMessage, setMenuMessage] = useState<Message | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Track keyboard height for FlatList bottom padding
  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Animate input bar position with keyboard (kbHeight is negative when open)
  const { height: kbHeight } = useReanimatedKeyboardAnimation();
  const bottomBarStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: kbHeight.value }],
    paddingBottom: kbHeight.value === 0 ? insets.bottom : 0,
  }));

  useEffect(() => {
    if (!user?.user_id) return;
    (async () => {
      try {
        const { channelId: houstonId } = await fetchHoustonDmChannel(user.user_id);
        setChannelId(houstonId);
      } catch (err) {
        console.error('[Houston] Failed to load DM channel:', err);
      }
    })();
  }, [user?.user_id]);

  const {
    messages, typingUsers, connected, loading, loadingOlder, hasOlder,
    sendMessage, sendTyping, stopTyping, markRead, loadOlderMessages,
  } = useChat(user?.user_id, channelId);

  useEffect(() => {
    if (!loading && messages.length > 0 && initialCountRef.current === null)
      initialCountRef.current = messages.length;
  }, [loading, messages.length]);

  useEffect(() => { if (channelId) markRead(); }, [channelId, messages.length]);

  const reversedMessages = [...messages].reverse();

  const prevMsgCount = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMsgCount.current && initialCountRef.current !== null) {
      if (shouldScrollRef.current || !showScrollBtn) {
        // Wait for FlatList to render the new message, then scroll fully to bottom
        setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 300);
        shouldScrollRef.current = false;
        setShowScrollBtn(false);
      } else {
        setUnreadWhileScrolled((c) => c + (messages.length - prevMsgCount.current));
      }
    }
    prevMsgCount.current = messages.length;
  }, [messages.length]);

  const handleScroll = useCallback((e: any) => {
    setShowScrollBtn(e.nativeEvent.contentOffset.y > 300);
  }, []);

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setUnreadWhileScrolled(0);
  }, []);

  const handleSend = useCallback((text: string) => {
    if (replyTo) { sendMessage(text, { replyToId: replyTo.id }); setReplyTo(null); }
    else sendMessage(text);
    // Mark that we should scroll on next message arrival
    shouldScrollRef.current = true;
  }, [sendMessage, replyTo]);

  const handleSendImage = useCallback(
    async (image: { uri: string; filename: string; mimeType: string }, caption: string) => {
      const att = await uploadFile(image.uri, image.filename, image.mimeType);
      sendMessage(caption || '', { messageType: 'image', attachments: [att] });
    }, [sendMessage]);

  const handleTypingStart = useCallback(() => sendTyping(user?.display_name), [sendTyping, user?.display_name]);

  const handleLongPress = useCallback((msg: Message) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMenuMessage(msg); setMenuVisible(true);
  }, []);

  const menuActions = menuMessage ? [
    { icon: 'arrow-undo-outline', label: 'Reply', onPress: () => setReplyTo(menuMessage) },
    { icon: 'copy-outline', label: 'Copy', onPress: () => { if (menuMessage.body) Clipboard.setString(menuMessage.body); } },
    { icon: 'trash-outline', label: 'Delete', onPress: () => {}, destructive: true },
  ] : [];

  const renderMessage = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const originalIdx = messages.length - 1 - index;
      const showAv = shouldShowAvatar(messages, item, originalIdx);
      const lastInGrp = isLastInGroup(messages, item, originalIdx);
      const dateSep = needsDateSeparator(messages, originalIdx);
      const isNew = initialCountRef.current !== null && originalIdx >= initialCountRef.current;
      return (
        <>
          {dateSep && <DateSeparator label={dateSep} />}
          <Pressable onLongPress={() => handleLongPress(item)} delayLongPress={300}>
            <MessageBubble
              message={item}
              isOwn={item.sender_id === user?.user_id}
              showAvatar={showAv}
              showName={showAv}
              isLastInGroup={lastInGrp}
              isNew={isNew}
            />
          </Pressable>
        </>
      );
    }, [messages, user?.user_id, handleLongPress]);

  const handleEndReached = useCallback(() => {
    if (hasOlder && !loadingOlder) loadOlderMessages();
  }, [hasOlder, loadingOlder, loadOlderMessages]);

  // Padding so messages scroll behind glass overlays
  const topPad = insets.top + 54; // toggle pill
  // Bottom padding: input bar + safe area OR keyboard (whichever is taller)
  const baseBottom = INPUT_BAR_HEIGHT + (replyTo ? 44 : 0) + insets.bottom;
  const kbBottom = INPUT_BAR_HEIGHT + (replyTo ? 44 : 0) + keyboardHeight;
  const bottomPad = Math.max(baseBottom, kbBottom);

  return (
    <View style={styles.container}>
      {/* ── Layer 1: Wallpaper ── */}
      <AnimatedBackground />

      {/* ── Layer 2: Messages (full screen, scrolls behind everything) ── */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#10b981" size="large" />
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>⚡</Text>
          <Text style={styles.emptyTitle}>Ask Houston anything</Text>
          <Text style={styles.emptySubtitle}>
            Deals, properties, contacts, comps — Houston has your entire CRM in his brain.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={reversedMessages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          inverted
          style={StyleSheet.absoluteFill}
          contentContainerStyle={{
            paddingTop: bottomPad,  // inverted: top = bottom of screen
            paddingBottom: topPad,  // inverted: bottom = top of screen
          }}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          onScroll={handleScroll}
          scrollEventThrottle={100}
          windowSize={10}
          maxToRenderPerBatch={10}
          removeClippedSubviews={Platform.OS !== 'web'}
          maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 80 }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={loadingOlder ? <ActivityIndicator color="#636366" style={{ padding: 12 }} /> : null}
          ListHeaderComponent={<TypingIndicator visible={typingUsers.length > 0} />}
        />
      )}

      {/* ── Layer 3a: Floating toggle pill (top) ── */}
      <ChatTogglePill />

      {/* ── Layer 3b: Scroll-to-bottom ── */}
      <View style={[styles.scrollBtnWrap, { bottom: bottomPad + 8 }]}>
        <ScrollToBottomButton visible={showScrollBtn} unreadCount={unreadWhileScrolled} onPress={scrollToBottom} />
      </View>

      {/* ── Layer 3c: Input bar (bottom, moves with keyboard) ── */}
      <Animated.View style={[styles.bottomBar, bottomBarStyle]}>
        {channelId && !connected && (
          <View style={styles.connectionBar}>
            <Text style={styles.connectionText}>Connecting...</Text>
          </View>
        )}

        {replyTo && (
          <BlurView intensity={40} tint="dark" style={styles.replyBar}>
            <View style={styles.replyAccent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.replyName} numberOfLines={1}>
                {replyTo.sender_type === 'houston' ? 'Houston' : replyTo.sender_name}
              </Text>
              <Text style={styles.replyText} numberOfLines={1}>{replyTo.body}</Text>
            </View>
            <Pressable onPress={() => setReplyTo(null)} hitSlop={12}>
              <Text style={styles.replyClose}>✕</Text>
            </Pressable>
          </BlurView>
        )}

        <ChatInput
          onSend={handleSend}
          onSendImage={handleSendImage}
          onTypingStart={handleTypingStart}
          onTypingStop={stopTyping}
          placeholder="Message..."
        />
      </Animated.View>

      {/* Context menu */}
      <MessageContextMenu
        visible={menuVisible}
        onClose={() => { setMenuVisible(false); setMenuMessage(null); }}
        actions={menuActions}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#08080F' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: '#fff', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#8e8e93', textAlign: 'center', lineHeight: 20 },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10 },
  connectionBar: { backgroundColor: 'rgba(255,59,48,0.85)', paddingVertical: 3, alignItems: 'center' },
  connectionText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  replyBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, overflow: 'hidden', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.08)' },
  replyAccent: { width: 3, height: '100%', minHeight: 28, backgroundColor: '#007AFF', borderRadius: 2, marginRight: 8 },
  replyName: { fontSize: 13, fontWeight: '600', color: '#007AFF' },
  replyText: { fontSize: 14, color: '#8e8e93', marginTop: 1 },
  replyClose: { fontSize: 16, color: '#636366', paddingLeft: 12 },
  scrollBtnWrap: { position: 'absolute', right: 0, zIndex: 5 },
});
