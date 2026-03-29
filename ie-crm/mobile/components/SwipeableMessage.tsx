// Telegram-style swipe-to-reply
// Drag message right → reply arrow appears → haptic at threshold → triggers onReply

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

const REPLY_THRESHOLD = 60;
const SPRING = { damping: 20, stiffness: 300 };

interface Props {
  children: React.ReactNode;
  onReply: () => void;
  enabled?: boolean;
}

function triggerHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

export default function SwipeableMessage({ children, onReply, enabled = true }: Props) {
  const translateX = useSharedValue(0);
  const hasTriggered = useSharedValue(false);

  const gesture = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX(15) // Only activate on clear horizontal swipe
    .failOffsetY([-10, 10]) // Fail if vertical
    .onUpdate((e) => {
      // Only allow rightward swipe, capped
      const x = Math.max(0, Math.min(e.translationX, 100));
      translateX.value = x;

      // Haptic at threshold
      if (x >= REPLY_THRESHOLD && !hasTriggered.value) {
        hasTriggered.value = true;
        runOnJS(triggerHaptic)();
      } else if (x < REPLY_THRESHOLD) {
        hasTriggered.value = false;
      }
    })
    .onEnd(() => {
      if (translateX.value >= REPLY_THRESHOLD) {
        runOnJS(onReply)();
      }
      translateX.value = withSpring(0, SPRING);
      hasTriggered.value = false;
    });

  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const arrowStyle = useAnimatedStyle(() => {
    const progress = Math.min(translateX.value / REPLY_THRESHOLD, 1);
    return {
      opacity: progress,
      transform: [
        { scale: 0.5 + progress * 0.5 },
        { translateX: -20 + translateX.value * 0.3 },
      ],
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={styles.container}>
        {/* Reply arrow behind the bubble */}
        <Animated.View style={[styles.replyArrow, arrowStyle]}>
          <View style={styles.arrowCircle}>
            <Ionicons name="arrow-undo" size={16} color="#fff" />
          </View>
        </Animated.View>

        {/* Message bubble slides right */}
        <Animated.View style={bubbleStyle}>
          {children}
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  replyArrow: {
    position: 'absolute',
    left: 8,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    zIndex: -1,
  },
  arrowCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
