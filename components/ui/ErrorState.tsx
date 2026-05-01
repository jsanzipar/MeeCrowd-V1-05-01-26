import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '@/theme';

interface ErrorStateProps {
  /** Override the default icon. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Short headline. Defaults to "Something went wrong". */
  title?: string;
  /** Friendly secondary line. */
  message?: string;
  /** Show a retry button with this handler. Omitted = no button. */
  onRetry?: () => void;
  /** Retry button label. Defaults to "Try again". */
  retryLabel?: string;
}

/**
 * Lightweight error slate — pair with ListEmptyComponent or isError branches.
 * Deliberately friendlier than a generic stack trace: no jargon, action
 * offered, icon softened to sad-cloud.
 */
export function ErrorState({
  icon = 'cloud-offline-outline',
  title = 'Something went wrong',
  message = "We couldn't load this right now. Check your connection and try again.",
  onRetry,
  retryLabel = 'Try again',
}: ErrorStateProps) {
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={48} color={colors.textMuted} />
      <Text style={styles.title}>{title}</Text>
      {message && <Text style={styles.message}>{message}</Text>}
      {onRetry && (
        <TouchableOpacity
          style={styles.retry}
          onPress={onRetry}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={retryLabel}
        >
          <Ionicons name="refresh" size={16} color={colors.white} />
          <Text style={styles.retryText}>{retryLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['3xl'],
  },
  title: {
    ...typography.h3,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  message: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: 'center',
    maxWidth: 300,
  },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
  },
  retryText: {
    ...typography.bodyBold,
    color: colors.white,
    fontSize: 14,
  },
});
