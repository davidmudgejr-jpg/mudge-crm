// Tab layout — headerless, tab bar hidden
// The floating glass toggle pill lives inside each screen

import React from 'react';
import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="houston" />
    </Tabs>
  );
}
