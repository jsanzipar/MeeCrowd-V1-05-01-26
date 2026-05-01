import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Pressable,
  Linking,
} from 'react-native';
import { Link, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/authStore';
import { colors, spacing, typography, radius } from '@/theme';

const TERMS_URL =
  process.env.EXPO_PUBLIC_TERMS_URL ?? 'https://meecrowd.com/terms';
const PRIVACY_URL =
  process.env.EXPO_PUBLIC_PRIVACY_URL ?? 'https://meecrowd.com/privacy';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ageFromDob(d: Date): number {
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

function formatDob(d: Date | null): string {
  if (!d) return '';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function RegisterScreen() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // 18 years ago as a reasonable default "landing" position for the picker
  const defaultDob = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 18);
    return d;
  }, []);
  const [dob, setDob] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const [termsAccepted, setTermsAccepted] = useState(false);

  const { signUp, isLoading } = useAuthStore();

  const maxDob = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 13);
    return d;
  }, []);
  const minDob = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 120);
    return d;
  }, []);

  const handleDobChange = (event: DateTimePickerEvent, selected?: Date) => {
    // On Android the picker dismisses itself; on iOS we keep it visible
    // until the user taps "Done".
    if (Platform.OS === 'android') {
      setShowPicker(false);
      if (event.type === 'set' && selected) setDob(selected);
    } else if (selected) {
      setDob(selected);
    }
  };

  const handleRegister = async () => {
    const u = username.trim();
    const e = email.trim();

    if (!u || !e || !password.trim()) {
      Alert.alert('Missing info', 'Please fill in all fields.');
      return;
    }
    if (!USERNAME_RE.test(u)) {
      Alert.alert(
        'Invalid username',
        'Username must be 3–20 characters and only contain letters, numbers, or underscores.'
      );
      return;
    }
    if (!EMAIL_RE.test(e)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Please re-enter your password.');
      return;
    }
    if (password.length < 8) {
      Alert.alert(
        'Password too short',
        'For your security, passwords must be at least 8 characters.'
      );
      return;
    }
    if (!dob) {
      Alert.alert('Date of birth required', 'Please enter your date of birth.');
      return;
    }
    if (ageFromDob(dob) < 13) {
      Alert.alert(
        'Sorry',
        'You must be at least 13 years old to create a MeeCrowd account.'
      );
      return;
    }
    if (!termsAccepted) {
      Alert.alert(
        'Agreement required',
        'Please read and accept the Terms of Service and Privacy Policy to continue.'
      );
      return;
    }

    try {
      await signUp(e, password, u, {
        date_of_birth: dob.toISOString().slice(0, 10),
        terms_accepted: true,
      });
      Alert.alert(
        'Almost there',
        "Check your email for a confirmation link. Once confirmed, you'll be signed in."
      );
    } catch (err: any) {
      Alert.alert('Registration failed', err.message ?? 'Something went wrong');
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
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>

          <View style={styles.header}>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Join the crowd</Text>
          </View>

          <View style={styles.form}>
            <Input
              label="Username"
              placeholder="Pick a username"
              icon="person-outline"
              autoCapitalize="none"
              value={username}
              onChangeText={setUsername}
              maxLength={20}
            />
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
              placeholder="Min. 8 characters"
              icon="lock-closed-outline"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <Input
              label="Confirm Password"
              placeholder="Re-enter password"
              icon="lock-closed-outline"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />

            {/* Date of Birth */}
            <Text style={styles.dobLabel}>Date of Birth</Text>
            <Pressable
              onPress={() => setShowPicker(true)}
              style={styles.dobField}
              accessibilityRole="button"
            >
              <Ionicons
                name="calendar-outline"
                size={20}
                color={colors.textMuted}
                style={styles.dobIcon}
              />
              <Text
                style={[
                  styles.dobValue,
                  !dob && { color: colors.textMuted },
                ]}
              >
                {dob ? formatDob(dob) : 'Select your date of birth'}
              </Text>
            </Pressable>
            <Text style={styles.dobHint}>
              You must be 13 or older to sign up.
            </Text>

            {showPicker && (
              <View style={Platform.OS === 'ios' ? styles.iosPicker : undefined}>
                <DateTimePicker
                  value={dob ?? defaultDob}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  maximumDate={maxDob}
                  minimumDate={minDob}
                  onChange={handleDobChange}
                  themeVariant="dark"
                />
                {Platform.OS === 'ios' && (
                  <Pressable
                    onPress={() => setShowPicker(false)}
                    style={styles.iosDone}
                  >
                    <Text style={styles.iosDoneText}>Done</Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* Terms & Privacy */}
            <Pressable
              onPress={() => setTermsAccepted((v) => !v)}
              style={styles.termsRow}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: termsAccepted }}
            >
              <View
                style={[
                  styles.checkbox,
                  termsAccepted && styles.checkboxChecked,
                ]}
              >
                {termsAccepted && (
                  <Ionicons name="checkmark" size={16} color={colors.white} />
                )}
              </View>
              <Text style={styles.termsText}>
                I am 13 years or older and I agree to the{' '}
                <Text
                  style={styles.termsLink}
                  onPress={() => Linking.openURL(TERMS_URL)}
                >
                  Terms of Service
                </Text>{' '}
                and{' '}
                <Text
                  style={styles.termsLink}
                  onPress={() => Linking.openURL(PRIVACY_URL)}
                >
                  Privacy Policy
                </Text>
                .
              </Text>
            </Pressable>

            <Button
              title="Create Account"
              onPress={handleRegister}
              loading={isLoading}
              size="lg"
              style={styles.button}
            />

            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <Link href="/(auth)/login" style={styles.link}>
                Sign In
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
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -spacing.sm,
    marginBottom: spacing.sm,
  },
  header: {
    marginBottom: spacing['3xl'],
  },
  title: {
    ...typography.h1,
    color: colors.text,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  form: {
    width: '100%',
  },
  dobLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  dobField: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dobIcon: {
    marginRight: spacing.sm,
  },
  dobValue: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
  dobHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  iosPicker: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  iosDone: {
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  iosDoneText: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginRight: spacing.md,
    marginTop: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  termsText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 22,
    fontSize: 14,
  },
  termsLink: {
    color: colors.primary,
    fontWeight: '600',
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
});
