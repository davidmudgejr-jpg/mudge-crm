// Bouncing dots typing indicator — matches the web PWA style

import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';

interface Props {
  visible: boolean;
}

export default function TypingIndicator({ visible }: Props) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    const createBounce = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: -6, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
        ])
      );

    const anim = Animated.parallel([
      createBounce(dot1, 0),
      createBounce(dot2, 150),
      createBounce(dot3, 300),
    ]);

    anim.start();
    return () => anim.stop();
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={styles.container}>
      <View style={styles.bubble}>
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View
            key={i}
            style={[styles.dot, { transform: [{ translateY: dot }] }]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginLeft: 52, // Avatar width + margin
  },
  bubble: {
    flexDirection: 'row',
    backgroundColor: '#2c2c2e',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#636366',
  },
});
