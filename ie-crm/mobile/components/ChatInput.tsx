// Native chat input bar — frosted glass effect
// Messages scroll behind the blur, Telegram-style

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  TextInput,
  Pressable,
  Image,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
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

  // Track keyboard state to toggle safe area padding
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardWillShow', () => setKeyboardOpen(true));
    const hideSub = Keyboard.addListener('keyboardWillHide', () => setKeyboardOpen(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const typingRef = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>();

  const handleSend = async () => {
    if (pendingImage) {
      setUploading(true);
      try {
        await onSendImage(pendingImage, text.trim());
      } finally {
        setUploading(false);
        setPendingImage(null);
        setText('');
        typingRef.current = false;
        onTypingStop();
      }
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
  };

  const handleChangeText = (value: string) => {
    setText(value);
    if (!typingRef.current) {
      typingRef.current = true;
      onTypingStart();
    }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      typingRef.current = false;
      onTypingStop();
    }, 2000);
  };

  const pickCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPendingImage({
        uri: asset.uri,
        filename: asset.fileName || `photo_${Date.now()}.jpg`,
        mimeType: asset.mimeType || 'image/jpeg',
      });
    }
  };

  const pickLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPendingImage({
        uri: asset.uri,
        filename: asset.fileName || `image_${Date.now()}.jpg`,
        mimeType: asset.mimeType || 'image/jpeg',
      });
    }
  };

  const cancelImage = () => setPendingImage(null);

  const hasContent = text.trim().length > 0 || pendingImage !== null;

  return (
    <BlurView intensity={80} tint="dark" style={[styles.container, !keyboardOpen && { paddingBottom: insets.bottom }]}>
      {/* Image preview strip */}
      {pendingImage && (
        <View style={styles.previewRow}>
          <View style={styles.previewWrap}>
            <Image source={{ uri: pendingImage.uri }} style={styles.previewImage} />
            <Pressable onPress={cancelImage} style={styles.cancelBtn}>
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

      {/* Input row */}
      <View style={styles.inputRow}>
        <Pressable onPress={pickLibrary} style={styles.iconBtn} hitSlop={8}>
          <Ionicons name="add-circle-outline" size={28} color="#007AFF" />
        </Pressable>

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
          multiline={false}
        />

        {hasContent ? (
          <Pressable
            onPress={handleSend}
            disabled={uploading}
            style={[styles.sendBtn, uploading && styles.sendBtnDisabled]}
          >
            <Ionicons name="arrow-up" size={20} color="#fff" />
          </Pressable>
        ) : (
          <Pressable onPress={pickCamera} style={styles.iconBtn} hitSlop={8}>
            <Ionicons name="camera-outline" size={24} color="#8e8e93" />
          </Pressable>
        )}
      </View>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  previewRow: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  previewWrap: {
    position: 'relative',
    alignSelf: 'flex-start',
  },
  previewImage: {
    width: 96,
    height: 96,
    borderRadius: 16,
  },
  cancelBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ff3b30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#e5e5e5',
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
});
