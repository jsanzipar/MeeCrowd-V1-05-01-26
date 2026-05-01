import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/authStore';
import { colors, spacing, typography, radius } from '@/theme';

const CONFIRM_PHRASE = 'DELETE';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { deleteAccount, isLoading, profile } = useAuthStore();
  const [confirmation, setConfirmation] = useState('');
  const [ackChecked, setAckChecked] = useState(false);

  const canDelete =
    confirmation.trim().toUpperCase() === CONFIRM_PHRASE && ackChecked;

  const handleDelete = () => {
    Alert.alert(
      'Delete account?',
      'This will permanently remove your posts, comments, likes, bookmarks, follows, and notifications. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount();
              // Sign-out inside deleteAccount clears session; AuthGate redirects.
            } catch (err: any) {
              Alert.alert(
                'Could not delete account',
                err.message ?? 'Something went wrong. Please try again.'
              );
            }
          },
        },
      ]
    );
  };

  return (
    <SafeScreen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.warningCard}>
            <View style={styles.warningIconWrap}>
              <Ionicons name="warning-outline" size={28} color={colors.error} />
            </View>
            <Text style={styles.warningTitle}>This is permanent</Text>
            <Text style={styles.warningBody}>
              When you delete your account, we will:
            </Text>
            <View style={styles.bullets}>
              <Bullet>Remove your profile from MeeCrowd.</Bullet>
              <Bullet>
                Permanently delete your posts, comments, likes, and bookmarks.
              </Bullet>
              <Bullet>Disconnect any linked platforms.</Bullet>
              <Bullet>
                Remove your account from our systems within 30 days.
              </Bullet>
            </View>
            <Text style={styles.warningBody}>
              Content others have saved or quoted may persist in their copies.
              We cannot recover deleted accounts.
            </Text>
          </View>

          <Text style={styles.label}>
            You are signed in as{' '}
            <Text style={styles.labelStrong}>
              @{profile?.username ?? 'unknown'}
            </Text>
            .
          </Text>

          <Text style={styles.instruction}>
            To confirm, type <Text style={styles.confirmToken}>{CONFIRM_PHRASE}</Text>{' '}
            below.
          </Text>

          <Input
            placeholder={CONFIRM_PHRASE}
            autoCapitalize="characters"
            autoCorrect={false}
            value={confirmation}
            onChangeText={setConfirmation}
            icon="alert-circle-outline"
          />

          <Pressable
            onPress={() => setAckChecked((v) => !v)}
            style={styles.ackRow}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: ackChecked }}
          >
            <View
              style={[styles.checkbox, ackChecked && styles.checkboxChecked]}
            >
              {ackChecked && (
                <Ionicons name="checkmark" size={16} color={colors.white} />
              )}
            </View>
            <Text style={styles.ackText}>
              I understand that this action is permanent and my data cannot be
              recovered.
            </Text>
          </Pressable>

          <Button
            title="Delete My Account"
            onPress={handleDelete}
            loading={isLoading}
            disabled={!canDelete || isLoading}
            size="lg"
            style={{
              ...styles.deleteButton,
              backgroundColor: canDelete ? colors.error : colors.border,
            }}
          />

          <Pressable onPress={() => router.back()} style={styles.cancelButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}

function SafeScreen({ children }: { children: React.ReactNode }) {
  return <View style={styles.safe}>{children}</View>;
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bulletRow}>
      <View style={styles.bulletDot} />
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: { flex: 1 },
  scroll: {
    padding: spacing['2xl'],
    paddingBottom: spacing['3xl'],
  },
  warningCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.error + '40',
    marginBottom: spacing.xl,
  },
  warningIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.error + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  warningTitle: {
    ...typography.h2,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  warningBody: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  bullets: {
    marginVertical: spacing.sm,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  bulletDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textSecondary,
    marginTop: 9,
    marginRight: spacing.sm,
  },
  bulletText: {
    ...typography.body,
    color: colors.textSecondary,
    flex: 1,
  },
  label: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  labelStrong: {
    color: colors.text,
    fontWeight: '600',
  },
  instruction: {
    ...typography.body,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  confirmToken: {
    color: colors.error,
    fontWeight: '700',
    letterSpacing: 1,
  },
  ackRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    borderColor: colors.error,
    backgroundColor: colors.error,
  },
  ackText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 20,
  },
  deleteButton: {
    marginTop: spacing.sm,
  },
  cancelButton: {
    marginTop: spacing.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  cancelText: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
