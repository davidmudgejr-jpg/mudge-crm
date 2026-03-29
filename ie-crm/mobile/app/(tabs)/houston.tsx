// Houston Direct — 1-on-1 chat with Houston AI
// Same chat mechanics as Team, but uses the houston_dm channel

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Text,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';

import { useAuth } from '../../hooks/useAuth';
import { useChat, fetchHoustonDmChannel, uploadFile, type Message } from '../../hooks/useChat';
import MessageBubble, { shouldShowAvatar, isLastInGroup, needsDateSeparator, DateSeparator } from '../../components/MessageBubble';
import ChatInput from '../../components/ChatInput';
import TypingIndicator from '../../components/TypingIndicator';
import AnimatedBackground from '../../components/AnimatedBackground';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function HoustonScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [channelId, setChannelId] = useState<string | null>(null);

  // Load Houston DM channel
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
    messages,
    typingUsers,
    connected,
    loading,
    loadingOlder,
    hasOlder,
    sendMessage,
    sendTyping,
    stopTyping,
    markRead,
    loadOlderMessages,
  } = useChat(user?.user_id, channelId);

  useEffect(() => {
    if (channelId) markRead();
  }, [channelId, messages.length]);

  const reversedMessages = [...messages].reverse();

  const handleSend = useCallback(
    (text: string) => sendMessage(text),
    [sendMessage]
  );

  const handleSendImage = useCallback(
    async (image: { uri: string; filename: string; mimeType: string }, caption: string) => {
      const att = await uploadFile(image.uri, image.filename, image.mimeType);
      sendMessage(caption || '', { messageType: 'image', attachments: [att] });
    },
    [sendMessage]
  );

  const handleTypingStart = useCallback(
    () => sendTyping(user?.display_name),
    [sendTyping, user?.display_name]
  );

  const renderMessage = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const originalIdx = messages.length - 1 - index;
      const showAv = shouldShowAvatar(messages, item, originalIdx);
      const lastInGrp = isLastInGroup(messages, item, originalIdx);
      const dateSep = needsDateSeparator(messages, originalIdx);
      return (
        <>
          {dateSep && <DateSeparator label={dateSep} />}
          <MessageBubble
            message={item}
            isOwn={item.sender_id === user?.user_id}
            showAvatar={showAv}
            showName={showAv}
            isLastInGroup={lastInGrp}
          />
        </>
      );
    },
    [messages, user?.user_id]
  );

  const handleEndReached = useCallback(() => {
    if (hasOlder && !loadingOlder) loadOlderMessages();
  }, [hasOlder, loadingOlder, loadOlderMessages]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <AnimatedBackground />

      {channelId && !connected && (
        <View style={styles.statusBar}>
          <Text style={styles.statusText}>Reconnecting...</Text>
        </View>
      )}

      {loading ? (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.centered}>
            <ActivityIndicator color="#10b981" size="large" />
          </View>
        </TouchableWithoutFeedback>
      ) : messages.length === 0 ? (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.centered}>
            <Text style={styles.emptyIcon}>⚡</Text>
            <Text style={styles.emptyTitle}>Ask Houston anything</Text>
            <Text style={styles.emptySubtitle}>
              Deals, properties, contacts, comps — Houston has your entire CRM in his brain. Drop screenshots and he'll read them too.
            </Text>
          </View>
        </TouchableWithoutFeedback>
      ) : (
        <FlatList
          data={reversedMessages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          inverted
          contentContainerStyle={{ paddingBottom: 100 }}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.2}
          ListFooterComponent={
            loadingOlder ? (
              <ActivityIndicator color="#636366" style={{ padding: 12 }} />
            ) : null
          }
          ListHeaderComponent={
            <TypingIndicator visible={typingUsers.length > 0} />
          }
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="never"
        />
      )}

      <ChatInput
        onSend={handleSend}
        onSendImage={handleSendImage}
        onTypingStart={handleTypingStart}
        onTypingStop={stopTyping}
        placeholder="Ask Houston..."
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#08080F',
  },
  statusBar: {
    backgroundColor: '#ff3b30',
    paddingVertical: 4,
    alignItems: 'center',
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#8e8e93',
    textAlign: 'center',
    lineHeight: 20,
  },
  inputOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  messageList: {
    paddingVertical: 8,
  },
});
