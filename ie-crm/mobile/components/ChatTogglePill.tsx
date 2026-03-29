// Floating glass toggle pill — Team | Houston
// position: absolute, centered below status bar, content scrolls behind it

import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export const TOGGLE_PILL_TOTAL_HEIGHT = 52; // insets.top + pill + padding

export default function ChatTogglePill() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const isHouston = pathname.includes('houston');

  return (
    <View style={[styles.wrapper, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
      <BlurView intensity={50} tint="dark" style={styles.pill}>
        <Pressable
          style={[styles.segment, !isHouston && styles.segmentActive]}
          onPress={() => router.replace('/')}
        >
          <Ionicons name="chatbubbles" size={14} color={!isHouston ? '#007AFF' : '#636366'} />
          <Text style={[styles.label, !isHouston && styles.labelActive]}>Team</Text>
        </Pressable>

        <View style={styles.divider} />

        <Pressable
          style={[styles.segment, isHouston && styles.segmentActiveHouston]}
          onPress={() => router.replace('/houston')}
        >
          <Ionicons name="flash" size={14} color={isHouston ? '#10b981' : '#636366'} />
          <Text style={[styles.label, isHouston && styles.labelActiveHouston]}>Houston</Text>
        </Pressable>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
  },
  segmentActive: {
    backgroundColor: 'rgba(0,122,255,0.15)',
  },
  segmentActiveHouston: {
    backgroundColor: 'rgba(16,185,129,0.15)',
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#636366',
  },
  labelActive: {
    color: '#007AFF',
  },
  labelActiveHouston: {
    color: '#10b981',
  },
});
