// Root layout — auth gate + dark theme
// AuthProvider wraps everything so all screens share the same user state

import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '../hooks/useAuth';
import LoginScreen from './login';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

// Houston dark theme — matches the CRM's #0f1117 bg
const HoustonDark = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#0f1117',
    card: '#1c1c1e',
    border: '#38383a',
    primary: '#007AFF',
  },
};

function RootLayoutInner() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  const { user, loading: authLoading, error: authError, login } = useAuth();

  useEffect(() => {
    if (fontError) throw fontError;
  }, [fontError]);

  useEffect(() => {
    if (fontsLoaded && !authLoading) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, authLoading]);

  // Still loading fonts or auth
  if (!fontsLoaded || authLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#007AFF" size="large" />
      </View>
    );
  }

  // Not authenticated — show login
  if (!user) {
    return (
      <ThemeProvider value={HoustonDark}>
        <LoginScreen onLogin={login} error={authError} loading={false} />
      </ThemeProvider>
    );
  }

  // Authenticated — show chat
  return (
    <ThemeProvider value={HoustonDark}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutInner />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#0f1117',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
