import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Linking,
  ScrollView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { notificationsService } from '@/services/notifications';
import { toast } from '@/lib/toast';
import { colors, spacing, typography } from '@/theme';

const TERMS_URL =
  process.env.EXPO_PUBLIC_TERMS_URL ?? 'https://meecrowd.com/terms';
const PRIVACY_URL =
  process.env.EXPO_PUBLIC_PRIVACY_URL ?? 'https://meecrowd.com/privacy';
const SUPPORT_EMAIL =
  process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? 'support@meecrowd.com';

interface SettingsRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
  badge?: number;
  sublabel?: string;
}

function SettingsRow({
  icon,
  label,
  onPress,
  danger,
  badge,
  sublabel,
}: SettingsRowProps) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <Ionicons
        name={icon}
        size={22}
        color={danger ? colors.error : colors.textSecondary}
      />
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, danger && styles.danger]}>{label}</Text>
        {sublabel && <Text style={styles.rowSublabel}>{sublabel}</Text>}
      </View>
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
  const { signOut } = useAuthStore();

  const { data: unreadCount } = useQuery({
    queryKey: ['unread-count'],
    queryFn: () => notificationsService.getUnreadCount(),
    refetchInterval: 30000,
  });

  const handleSignOut = () => {
    // react-native-web's Alert.alert is effectively a no-op — it silently
    // swallows the call and never fires the confirm button's onPress. So on
    // web we fall back to window.confirm; on native we get the real Alert.
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (typeof window !== 'undefined' && window.confirm('Are you sure you want to sign out?')) {
        signOut();
      }
      return;
    }
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  const openUrl = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      // Alert.alert is a silent no-op on rn-web; toast works cross-platform.
      toast.error({ title: "Couldn't open link", message: 'Please try again later.' });
    }
  };

  const openSupportEmail = () => {
    const subject = encodeURIComponent('MeeCrowd Support');
    openUrl(`mailto:${SUPPORT_EMAIL}?subject=${subject}`);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      {/* Alerts */}
      <View style={styles.section}>
        <SettingsRow
          icon="notifications-outline"
          label="Alerts"
          onPress={() => router.push('/(app)/settings/notifications')}
          badge={unreadCount}
        />
      </View>

      {/* Account */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <SettingsRow
          icon="person-outline"
          label="Edit Profile"
          onPress={() => router.push('/(app)/settings/edit-profile')}
        />
      </View>

      {/* Safety */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Safety</Text>
        <SettingsRow
          icon="ban-outline"
          label="Blocked Users"
          onPress={() => router.push('/(app)/settings/blocked')}
        />
      </View>

      {/* Legal & Support */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Legal & Support</Text>
        <SettingsRow
          icon="document-text-outline"
          label="Terms of Service"
          onPress={() => openUrl(TERMS_URL)}
        />
        <SettingsRow
          icon="shield-outline"
          label="Privacy Policy"
          onPress={() => openUrl(PRIVACY_URL)}
        />
        <SettingsRow
          icon="help-circle-outline"
          label="Contact Support"
          sublabel={SUPPORT_EMAIL}
          onPress={openSupportEmail}
        />
      </View>

      {/* Danger zone */}
      <View style={styles.section}>
        <SettingsRow
          icon="log-out-outline"
          label="Sign Out"
          onPress={handleSignOut}
        />
        <SettingsRow
          icon="trash-outline"
          label="Delete Account"
          onPress={() => router.push('/(app)/settings/delete-account')}
          danger
        />
      </View>

      <Text style={styles.version}>MeeCrowd v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    paddingBottom: spacing['3xl'],
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
  },
  rowSublabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
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
