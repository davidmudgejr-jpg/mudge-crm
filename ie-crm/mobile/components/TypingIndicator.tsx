// Telegram-style typing indicator — bouncing dots inside a message bubble
// Shows aligned with incoming messages, with Houston's avatar

import React, { useEffect, useRef } from 'react';
import { View, Image, Animated, StyleSheet, Text } from 'react-native';

const HOUSTON_AVATAR = require('../assets/images/icon.png');

interface Props {
  visible: boolean;
  name?: string; // e.g. "Houston"
  isHouston?: boolean;
}

export default function TypingIndicator({ visible, name, isHouston = true }: Props) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      Animated.timing(fadeIn, { toValue: 0, duration: 150, useNativeDriver: true }).start();
      return;
    }

    Animated.timing(fadeIn, { toValue: 1, duration: 200, useNativeDriver: true }).start();

    const createBounce = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: -5, duration: 280, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 280, useNativeDriver: true }),
        ])
      );

    const anim = Animated.parallel([
      createBounce(dot1, 0),
      createBounce(dot2, 140),
      createBounce(dot3, 280),
    ]);

    anim.start();
    return () => anim.stop();
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.container, { opacity: fadeIn }]}>
      {/* Avatar */}
      {isHouston ? (
        <Image source={HOUSTON_AVATAR} style={styles.avatar} />
      ) : (
        <View style={styles.avatarPlaceholder} />
      )}

      {/* Bubble with dots */}
      <View style={[styles.bubble, isHouston && styles.bubbleHouston]}>
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View
            key={i}
            style={[styles.dot, { transform: [{ translateY: dot }] }]}
          />
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginHorizontal: 8,
    marginTop: 4,
    marginBottom: 2,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: 6,
  },
  avatarPlaceholder: {
    width: 36, // avatar + margin
  },
  bubble: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  bubbleHouston: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderColor: 'rgba(16,185,129,0.08)',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
});
