// Login screen — email + password, dark theme, Houston branding

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';

interface Props {
  onLogin: (email: string, password: string) => Promise<void>;
  error: string | null;
  loading: boolean;
}

export default function LoginScreen({ onLogin, error, loading }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = () => {
    if (!email.trim() || !password.trim()) return;
    onLogin(email.trim(), password.trim());
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        {/* Logo / brand */}
        <Text style={styles.lightning}>⚡</Text>
        <Text style={styles.title}>Houston</Text>
        <Text style={styles.subtitle}>IE CRM Team Chat</Text>

        {/* Error */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Email */}
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor="#636366"
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
        />

        {/* Password */}
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor="#636366"
          style={styles.input}
          secureTextEntry
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={handleSubmit}
        />

        {/* Sign in button */}
        <Pressable
          onPress={handleSubmit}
          disabled={loading || !email.trim() || !password.trim()}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            (loading || !email.trim() || !password.trim()) && styles.buttonDisabled,
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1117',
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  lightning: {
    fontSize: 48,
    textAlign: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: '#8e8e93',
    textAlign: 'center',
    marginBottom: 40,
  },
  errorBox: {
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#ff3b30',
    fontSize: 14,
    textAlign: 'center',
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#38383a',
    backgroundColor: '#1c1c1e',
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#e5e5e5',
    marginBottom: 12,
  },
  button: {
    height: 48,
    borderRadius: 12,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
});
