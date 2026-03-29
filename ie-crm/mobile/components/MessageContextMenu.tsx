// Telegram-style long-press context menu
// Message lifts with blur backdrop, shows action row

import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn, FadeOut, SlideInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface Action {
  icon: string;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  actions: Action[];
  messagePreview?: React.ReactNode;
}

export default function MessageContextMenu({ visible, onClose, actions, messagePreview }: Props) {
  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(100)} style={styles.overlay}>
        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />

        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        {/* Message preview — lifted */}
        {messagePreview && (
          <Animated.View entering={SlideInDown.springify().damping(18).stiffness(250)} style={styles.preview}>
            {messagePreview}
          </Animated.View>
        )}

        {/* Action menu */}
        <Animated.View
          entering={SlideInDown.springify().damping(18).stiffness(250).delay(50)}
          style={styles.menu}
        >
          {actions.map((action, i) => (
            <Pressable
              key={action.label}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                action.onPress();
                onClose();
              }}
              style={[
                styles.menuItem,
                i < actions.length - 1 && styles.menuItemBorder,
              ]}
            >
              <Ionicons
                name={action.icon as any}
                size={20}
                color={action.destructive ? '#ff3b30' : '#fff'}
              />
              <Text style={[styles.menuLabel, action.destructive && styles.destructive]}>
                {action.label}
              </Text>
            </Pressable>
          ))}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  preview: {
    marginBottom: 12,
    maxWidth: '90%',
  },
  menu: {
    backgroundColor: 'rgba(44,44,46,0.95)',
    borderRadius: 14,
    overflow: 'hidden',
    minWidth: 200,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  menuItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  menuLabel: {
    fontSize: 16,
    color: '#fff',
  },
  destructive: {
    color: '#ff3b30',
  },
});
