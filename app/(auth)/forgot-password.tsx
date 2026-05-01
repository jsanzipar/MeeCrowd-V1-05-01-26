import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { authService } from '@/services/auth';
import { colors, spacing, typography } from '@/theme';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleReset = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      Alert.alert('Missing email', 'Please enter the email for your account.');
      return;
    }
    // Basic email sanity check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    try {
      await authService.resetPassword(trimmed);
      // Always show a success screen regardless of whether the email exists —
      // prevents user-enumeration through the forgot-password endpoint.
      setIsSent(true);
    } catch (err: any) {
      // Supabase may throw on hard failures (rate limit, network). Still don't
      // leak whether the account exists.
      setIsSent(true);
    } finally {
      setIsLoading(false);
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
          <Pressable onPress={() => router.back()} style={styles.back} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>

          {isSent ? (
            <View style={styles.doneArea}>
              <View style={styles.iconCircle}>
                <Ionicons name="mail-open-outline" size={44} color={colors.primary} />
              </View>
              <Text style={styles.title}>Check your email</Text>
              <Text style={styles.subtitle}>
                If an account exists for {email.trim()}, we sent a link to reset your
                password. The link expires in 1 hour.
              </Text>
              <Button
                title="Back to Sign In"
                onPress={() => router.replace('/(auth)/login')}
                size="lg"
                style={styles.button}
              />
              <Pressable
                onPress={() => {
                  setIsSent(false);
                  setEmail('');
                }}
                style={styles.tryAgain}
              >
                <Text style={styles.tryAgainText}>Try a different email</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.form}>
              <Text style={styles.title}>Reset your password</Text>
              <Text style={styles.subtitle}>
                Enter the email you use to sign in and we'll send you a link to
                create a new password.
              </Text>

              <Input
                label="Email"
                placeholder="you@example.com"
                icon="mail-outline"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />

              <Button
                title="Send reset link"
                onPress={handleReset}
                loading={isLoading}
                size="lg"
                style={styles.button}
              />
            </View>
          )}
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
    padding: spacing['2xl'],
  },
  back: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  form: {
    marginTop: spacing.xl,
  },
  doneArea: {
    marginTop: spacing['3xl'],
    alignItems: 'center',
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.h1,
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing['2xl'],
    textAlign: 'center',
  },
  button: {
    marginTop: spacing.md,
    alignSelf: 'stretch',
  },
  tryAgain: {
    marginTop: spacing.lg,
    padding: spacing.sm,
  },
  tryAgainText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
  },
});
