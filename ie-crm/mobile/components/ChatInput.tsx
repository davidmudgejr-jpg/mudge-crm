// Floating glass pill input — NOT a footer bar
// Hovers over chat content with blur-through effect
// [+]  [____Message...____  📷/⬆]  — independent elements

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  TextInput,
  Pressable,
  Image,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
// Animated import removed — using conditional render for send/camera swap
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

interface PendingImage {
  uri: string;
  filename: string;
  mimeType: string;
}

interface Props {
  onSend: (text: string) => void;
  onSendImage: (image: PendingImage, caption: string) => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
  placeholder?: string;
}

export default function ChatInput({ onSend, onSendImage, onTypingStart, onTypingStop, placeholder }: Props) {
  const insets = useSafeAreaInsets();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [text, setText] = useState('');
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const typingRef = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>();

  const hasContent = text.trim().length > 0 || pendingImage !== null;

  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const handleSend = useCallback(async () => {
    if (pendingImage) {
      setUploading(true);
      try { await onSendImage(pendingImage, text.trim()); }
      finally { setUploading(false); setPendingImage(null); setText(''); typingRef.current = false; onTypingStop(); }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
    typingRef.current = false;
    onTypingStop();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [text, pendingImage, onSend, onSendImage, onTypingStop]);

  const handleChangeText = useCallback((value: string) => {
    setText(value);
    if (!typingRef.current) { typingRef.current = true; onTypingStart(); }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => { typingRef.current = false; onTypingStop(); }, 2000);
  }, [onTypingStart, onTypingStop]);

  const pickCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return;
    const r = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!r.canceled && r.assets[0]) {
      const a = r.assets[0];
      setPendingImage({ uri: a.uri, filename: a.fileName || `photo_${Date.now()}.jpg`, mimeType: a.mimeType || 'image/jpeg' });
    }
  };

  const pickLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!r.canceled && r.assets[0]) {
      const a = r.assets[0];
      setPendingImage({ uri: a.uri, filename: a.fileName || `image_${Date.now()}.jpg`, mimeType: a.mimeType || 'image/jpeg' });
    }
  };

  const bottomPad = keyboardOpen ? 4 : Math.max(insets.bottom, 8);

  return (
    <View style={[styles.floatingContainer, { paddingBottom: bottomPad }]}>
      {/* Image preview */}
      {pendingImage && (
        <View style={styles.previewRow}>
          <View style={styles.previewWrap}>
            <Image source={{ uri: pendingImage.uri }} style={styles.previewImg} />
            <Pressable onPress={() => setPendingImage(null)} style={styles.cancelBtn}>
              <Ionicons name="close" size={14} color="#fff" />
            </Pressable>
            {uploading && (
              <View style={styles.uploadOverlay}>
                <ActivityIndicator color="#fff" />
              </View>
            )}
          </View>
        </View>
      )}

      <View style={styles.inputRow}>
        {/* + button — floating independently */}
        <Pressable onPress={pickLibrary} style={styles.floatingIcon} hitSlop={8}>
          <Ionicons name="add-circle" size={30} color="#007AFF" />
        </Pressable>

        {/* Glass pill */}
        <BlurView intensity={40} tint="dark" style={styles.pill}>
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={handleChangeText}
            onSubmitEditing={handleSend}
            placeholder={placeholder || 'Message...'}
            placeholderTextColor="#636366"
            style={styles.input}
            returnKeyType="send"
            blurOnSubmit={false}
            autoCorrect
            multiline
            maxLength={4000}
            textAlignVertical="center"
          />

          {/* Right action inside the pill — only ONE visible at a time */}
          <View style={styles.pillAction}>
            {hasContent ? (
              <Pressable
                onPress={handleSend}
                disabled={uploading}
                style={styles.sendBtn}
              >
                <Ionicons name="arrow-up" size={16} color="#fff" />
              </Pressable>
            ) : (
              <Pressable
                onPress={pickCamera}
                style={styles.cameraBtn}
                hitSlop={8}
              >
                <Ionicons name="camera-outline" size={22} color="#8e8e93" />
              </Pressable>
            )}
          </View>
        </BlurView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  floatingContainer: {
    // No background — transparent, floats over content
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 6,
  },
  previewRow: {
    paddingHorizontal: 44, // align with pill
    paddingBottom: 6,
  },
  previewWrap: {
    position: 'relative',
    alignSelf: 'flex-start',
  },
  previewImg: {
    width: 72,
    height: 72,
    borderRadius: 12,
  },
  cancelBtn: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ff3b30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  floatingIcon: {
    width: 34,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  input: {
    flex: 1,
    minHeight: 38,
    maxHeight: 100,
    paddingHorizontal: 16,
    paddingTop: 9,
    paddingBottom: 9,
    fontSize: 16,
    color: '#e5e5e5',
    lineHeight: 22,
  },
  pillAction: {
    width: 34,
    height: 38,
    position: 'relative',
    marginRight: 4,
  },
  sendBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    bottom: 5,
  },
  cameraBtn: {
    width: 34,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    right: -2,
    bottom: 0,
  },
});
