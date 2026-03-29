// Telegram-style animated wallpaper — slowly shifting dark gradient
// with subtle star field overlay for depth

import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Animated, Easing, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// ── Gradient layer — slowly rotating color stops ──────────────
function GradientLayer() {
  const opacity1 = useRef(new Animated.Value(1)).current;
  const opacity2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Crossfade between two gradients for smooth color transition
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(opacity1, { toValue: 0, duration: 12000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(opacity2, { toValue: 1, duration: 12000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(opacity1, { toValue: 1, duration: 12000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(opacity2, { toValue: 0, duration: 12000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);

  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: opacity1 }]}>
        <LinearGradient
          colors={['#0a0e1a', '#0f1628', '#0d1320', '#080c14']}
          locations={[0, 0.35, 0.7, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: opacity2 }]}>
        <LinearGradient
          colors={['#0d0f1e', '#0a1525', '#10162a', '#090d16']}
          locations={[0, 0.3, 0.65, 1]}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </>
  );
}

// ── Nebula blobs — subtle color splashes ──────────────────────
interface BlobConfig {
  color: string;
  size: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  duration: number;
}

function NebulaBlob({ blob }: { blob: BlobConfig }) {
  const x = useRef(new Animated.Value(blob.startX)).current;
  const y = useRef(new Animated.Value(blob.startY)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(x, { toValue: blob.endX, duration: blob.duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(x, { toValue: blob.startX, duration: blob.duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(y, { toValue: blob.endY, duration: blob.duration * 1.15, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(y, { toValue: blob.startY, duration: blob.duration * 1.15, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: blob.size,
        height: blob.size,
        borderRadius: blob.size / 2,
        backgroundColor: blob.color,
        transform: [{ translateX: x }, { translateY: y }],
      }}
    />
  );
}

const BLOBS: BlobConfig[] = [
  { color: 'rgba(59, 40, 120, 0.08)', size: 350, startX: -80, startY: -60, endX: 120, endY: 160, duration: 26000 },
  { color: 'rgba(20, 60, 130, 0.06)', size: 300, startX: 200, startY: 140, endX: 20, endY: 340, duration: 30000 },
  { color: 'rgba(16, 80, 90, 0.05)', size: 280, startX: 40, startY: 520, endX: -40, endY: 300, duration: 24000 },
];

// ── Stars — tiny dots with occasional twinkle ────────────────
interface StarConfig {
  x: number;
  y: number;
  size: number;
  opacity: number;
  twinkle: boolean;
}

function Star({ star }: { star: StarConfig }) {
  const anim = useRef(new Animated.Value(star.opacity)).current;

  useEffect(() => {
    if (!star.twinkle) return;
    Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 0.5, duration: 2000 + Math.random() * 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0.1, duration: 2000 + Math.random() * 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: star.x,
        top: star.y,
        width: star.size,
        height: star.size,
        borderRadius: star.size / 2,
        backgroundColor: '#fff',
        opacity: star.twinkle ? anim : star.opacity,
      }}
    />
  );
}

// ── Combined background ──────────────────────────────────────
export default function AnimatedBackground() {
  const { width, height } = useWindowDimensions();

  const stars = useMemo(() => {
    const result: StarConfig[] = [];
    for (let i = 0; i < 35; i++) {
      result.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: 1 + Math.random() * 1.5,
        opacity: 0.05 + Math.random() * 0.2,
        twinkle: i < 6,
      });
    }
    return result;
  }, [width, height]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <GradientLayer />
      {BLOBS.map((blob, i) => <NebulaBlob key={`b-${i}`} blob={blob} />)}
      {stars.map((star, i) => <Star key={`s-${i}`} star={star} />)}
    </View>
  );
}
