// Tab layout — Team Chat and Houston Direct tabs
// Header has toggle buttons so you can switch even when keyboard is up

import React from 'react';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';

function HeaderTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const isHouston = pathname.includes('houston');

  return (
    <View style={headerStyles.container}>
      <Pressable
        style={[headerStyles.tab, !isHouston && headerStyles.tabActive]}
        onPress={() => router.replace('/')}
      >
        <Ionicons name="chatbubbles" size={16} color={!isHouston ? '#007AFF' : '#636366'} />
        <Text style={[headerStyles.tabText, !isHouston && headerStyles.tabTextActive]}>Team</Text>
      </Pressable>
      <Pressable
        style={[headerStyles.tab, isHouston && headerStyles.tabActiveHouston]}
        onPress={() => router.replace('/houston')}
      >
        <Ionicons name="flash" size={16} color={isHouston ? '#10b981' : '#636366'} />
        <Text style={[headerStyles.tabText, isHouston && headerStyles.tabTextActiveHouston]}>Houston</Text>
      </Pressable>
    </View>
  );
}

const headerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    padding: 2,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 18,
  },
  tabActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  tabActiveHouston: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  tabText: {
    color: '#636366',
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#007AFF',
  },
  tabTextActiveHouston: {
    color: '#10b981',
  },
});

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerTransparent: true,
        headerStyle: { backgroundColor: 'transparent' },
        headerTitleStyle: { color: '#fff', fontWeight: '600' },
        headerTintColor: '#007AFF',
        headerTitle: () => <HeaderTabs />,
        headerBackground: () => (
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
        ),
        tabBarStyle: { display: 'none' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles" size={size} color={color} />
          ),
          tabBarLabel: 'Team',
        }}
      />
      <Tabs.Screen
        name="houston"
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="flash" size={size} color={color} />
          ),
          tabBarLabel: 'Houston',
          tabBarActiveTintColor: '#10b981',
        }}
      />
    </Tabs>
  );
}
