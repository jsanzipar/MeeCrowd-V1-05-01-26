import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { notificationsService } from '@/services/notifications';
import { colors, spacing, radius, typography } from '@/theme';

interface SettingsRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
  badge?: number;
}

function SettingsRow({ icon, label, onPress, danger, badge }: SettingsRowProps) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress}>
      <Ionicons
        name={icon}
        size={22}
        color={danger ? colors.error : colors.textSecondary}
      />
      <Text style={[styles.rowLabel, danger && styles.danger]}>{label}</Text>
      {badge != null && badge > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { signOut, profile } = useAuthStore();

  const { data: unreadCount } = useQuery({
    queryKey: ['unread-count'],
    queryFn: () => notificationsService.getUnreadCount(),
    refetchInterval: 30000,
  });

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* Alerts section */}
      <View style={styles.section}>
        <SettingsRow
          icon="notifications-outline"
          label="Alerts"
          onPress={() => router.push('/(app)/settings/notifications')}
          badge={unreadCount}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <SettingsRow
          icon="person-outline"
          label="Edit Profile"
          onPress={() => router.push('/(app)/settings/edit-profile')}
        />
        <SettingsRow
          icon="link-outline"
          label="Connected Platforms"
          onPress={() => router.push('/(app)/settings/platforms')}
        />
        <SettingsRow
          icon="options-outline"
          label="Notification Preferences"
          onPress={() => Alert.alert('Coming soon')}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Support</Text>
        <SettingsRow
          icon="help-circle-outline"
          label="Help & FAQ"
          onPress={() => Alert.alert('Coming soon')}
        />
        <SettingsRow
          icon="document-text-outline"
          label="Terms of Service"
          onPress={() => Alert.alert('Coming soon')}
        />
        <SettingsRow
          icon="shield-outline"
          label="Privacy Policy"
          onPress={() => Alert.alert('Coming soon')}
        />
      </View>

      <View style={styles.section}>
        <SettingsRow
          icon="log-out-outline"
          label="Sign Out"
          onPress={handleSignOut}
          danger
        />
      </View>

      <Text style={styles.version}>MeeCrowd v1.0.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  rowLabel: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
  danger: {
    color: colors.error,
  },
  badge: {
    backgroundColor: colors.error,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  version: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing['3xl'],
  },
});
