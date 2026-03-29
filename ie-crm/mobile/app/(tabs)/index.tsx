// Team Chat screen — group chat with family + Houston
// Uses inverted FlatList for native chat scrolling behavior

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { useChat, fetchChannels, seedChannels, uploadFile, type Message } from '../../hooks/useChat';
import MessageBubble, { shouldShowAvatar, isLastInGroup, needsDateSeparator, DateSeparator } from '../../components/MessageBubble';
import ChatInput from '../../components/ChatInput';
import TypingIndicator from '../../components/TypingIndicator';
import AnimatedBackground from '../../components/AnimatedBackground';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TeamChatScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [channelId, setChannelId] = useState<string | null>(null);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [channelStatus, setChannelStatus] = useState('starting...');

  // Load team channel on mount
  useEffect(() => {
    if (!user?.user_id) return;
    (async () => {
      try {
        setChannelStatus('seeding...');
        await seedChannels();
        setChannelStatus('fetching channels...');
        const channels = await fetchChannels(user.user_id);
        setChannelStatus(`got ${channels?.length || 0} channels`);
        const teamCh = channels.find((c: any) => c.channel_type === 'group');
        if (teamCh) {
          setChannelId(teamCh.id);
          setChannelStatus('connected');
        } else {
          setChannelError('No group channel found');
        }
      } catch (err: any) {
        setChannelError(err.message || 'Unknown error');
        setChannelStatus('error');
      }
    })();
  }, [user?.user_id]);

  const {
    messages,
    typingUsers,
    connected,
    loading,
    loadingOlder,
    error: chatError,
    hasOlder,
    sendMessage,
    sendTyping,
    stopTyping,
    markRead,
    loadOlderMessages,
  } = useChat(user?.user_id, channelId);

  // Mark read when messages change
  useEffect(() => {
    if (channelId) markRead();
  }, [channelId, messages.length]);

  // Inverted FlatList renders newest at bottom naturally
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

      {/* Connection status */}
      {channelId && !connected && (
        <View style={styles.statusBar}>
          <Text style={styles.statusText}>Reconnecting...</Text>
        </View>
      )}

      {/* Messages */}
      {loading ? (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.centered}>
            <ActivityIndicator color="#007AFF" size="large" />
          </View>
        </TouchableWithoutFeedback>
      ) : messages.length === 0 ? (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.centered}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyTitle}>Team Chat</Text>
            <Text style={styles.emptySubtitle}>
              Chat with your team. Houston is listening and will jump in when he has something useful.
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

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        onSendImage={handleSendImage}
        onTypingStart={handleTypingStart}
        onTypingStop={stopTyping}
        placeholder="Message..."
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
});
