// Space-themed ambient background — nebula blobs + drifting star field
// Barely perceptible animation, like floating through a nebula

import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Animated, Easing, useWindowDimensions } from 'react-native';

// ── Layer 1: Nebula blobs ──────────────────────────────────────
interface NebulaBlobConfig {
  color: string;
  size: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  duration: number;
}

function NebulaBlob({ blob }: { blob: NebulaBlobConfig }) {
  const translateX = useRef(new Animated.Value(blob.startX)).current;
  const translateY = useRef(new Animated.Value(blob.startY)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(translateX, {
          toValue: blob.endX,
          duration: blob.duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: blob.startX,
          duration: blob.duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(translateY, {
          toValue: blob.endY,
          duration: blob.duration * 1.15,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: blob.startY,
          duration: blob.duration * 1.15,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: blob.size,
        height: blob.size,
        borderRadius: blob.size / 2,
        backgroundColor: blob.color,
        transform: [{ translateX }, { translateY }],
      }}
    />
  );
}

const NEBULA_BLOBS: NebulaBlobConfig[] = [
  { color: 'rgba(88, 28, 135, 0.12)', size: 320, startX: -60, startY: -40, endX: 100, endY: 140, duration: 24000 },
  { color: 'rgba(30, 58, 138, 0.10)', size: 280, startX: 180, startY: 120, endX: 40, endY: 320, duration: 28000 },
  { color: 'rgba(20, 83, 96, 0.08)', size: 300, startX: 60, startY: 500, endX: -30, endY: 280, duration: 22000 },
];

// ── Layer 2: Star field ────────────────────────────────────────
interface StarConfig {
  x: number;
  size: number;
  opacity: number;
  speed: number; // seconds to cross screen
  startY: number;
  twinkle: boolean;
}

function Star({ star, screenHeight }: { star: StarConfig; screenHeight: number }) {
  const translateY = useRef(new Animated.Value(star.startY)).current;
  const twinkleOpacity = useRef(new Animated.Value(star.opacity)).current;

  useEffect(() => {
    // Slow upward drift
    Animated.loop(
      Animated.timing(translateY, {
        toValue: -20,
        duration: star.speed * 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // Reset position when off screen (approximation via loop)
    const resetInterval = setInterval(() => {
      translateY.setValue(screenHeight + 20);
    }, star.speed * 1000);

    // Twinkle animation for select stars
    if (star.twinkle) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(twinkleOpacity, {
            toValue: 0.5,
            duration: 1500 + Math.random() * 2000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(twinkleOpacity, {
            toValue: 0.15,
            duration: 1500 + Math.random() * 2000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      ).start();
    }

    return () => clearInterval(resetInterval);
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: star.x,
        width: star.size,
        height: star.size,
        borderRadius: star.size / 2,
        backgroundColor: '#fff',
        opacity: star.twinkle ? twinkleOpacity : star.opacity,
        transform: [{ translateY }],
      }}
    />
  );
}

// ── Combined background ────────────────────────────────────────
export default function AnimatedBackground() {
  const { width, height } = useWindowDimensions();

  const stars = useMemo(() => {
    const result: StarConfig[] = [];
    for (let i = 0; i < 45; i++) {
      result.push({
        x: Math.random() * width,
        size: 1 + Math.random() * 2,
        opacity: 0.1 + Math.random() * 0.3,
        speed: 60 + Math.random() * 30, // 60-90 seconds
        startY: Math.random() * height,
        twinkle: i < 7, // first 7 stars twinkle
      });
    }
    return result;
  }, [width, height]);

  return (
    <Animated.View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Layer 1: Nebula */}
      {NEBULA_BLOBS.map((blob, i) => (
        <NebulaBlob key={`nebula-${i}`} blob={blob} />
      ))}
      {/* Layer 2: Stars */}
      {stars.map((star, i) => (
        <Star key={`star-${i}`} star={star} screenHeight={height} />
      ))}
    </Animated.View>
  );
}
