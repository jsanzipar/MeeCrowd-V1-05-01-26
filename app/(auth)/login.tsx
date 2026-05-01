import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/authStore';
import { colors, spacing, typography } from '@/theme';

const LOGO = require('@/assets/images/logo-w.png');

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { signIn, isLoading } = useAuthStore();

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    try {
      await signIn(email.trim(), password);
    } catch (err: any) {
      Alert.alert('Login failed', err.message ?? 'Something went wrong');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo */}
          <View style={styles.logoArea}>
            <Image source={LOGO} style={styles.logo} resizeMode="contain" />
            <Text style={styles.tagline}>Your crowd, one place</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Input
              label="Email"
              placeholder="you@example.com"
              icon="mail-outline"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
            <Input
              label="Password"
              placeholder="Your password"
              icon="lock-closed-outline"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            <View style={styles.forgotRow}>
              <Link href="/(auth)/forgot-password" style={styles.forgotLink}>
                Forgot password?
              </Link>
            </View>

            <Button
              title="Sign In"
              onPress={handleLogin}
              loading={isLoading}
              size="lg"
              style={styles.button}
            />

            <View style={styles.footer}>
              <Text style={styles.footerText}>Don't have an account? </Text>
              <Link href="/(auth)/register" style={styles.link}>
                Sign Up
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing['2xl'],
  },
  logoArea: {
    alignItems: 'center',
    marginBottom: spacing['4xl'],
  },
  logo: {
    width: 260,
    height: 90,
    marginBottom: spacing.md,
  },
  tagline: {
    fontSize: 17,
    fontWeight: '500',
    lineHeight: 24,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    letterSpacing: -0.2,
  },
  form: {
    width: '100%',
  },
  button: {
    marginTop: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing['2xl'],
  },
  footerText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  link: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  forgotRow: {
    alignItems: 'flex-end',
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  forgotLink: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.primary,
  },
});
