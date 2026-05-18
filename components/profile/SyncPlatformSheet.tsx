// Bottom-sheet modal that lets the user connect a new creator platform.
//
// Lists every platform we know about, marks the ones already synced as
// "Connected" (disabled tap), and routes new connections to the
// platform-specific OAuth start URL via Linking.openURL.
//
// Triggered by the magnet icon in CrowdStatsBar.
import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Image,
  StyleSheet,
  Pressable,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { buildOAuthStartUrl } from '@/services/creator';
import { colors, spacing, radius, typography } from '@/theme';
import type { Platform } from '@/types';

const STORAGE_BASE =
  'https://nfreggighhtvznvcofql.supabase.co/storage/v1/object/public/assets/logos';

interface PlatformRow {
  key: Platform;
  label: string;
  logo: string;
  /** OAuth-backed creator sync is wired up. Other platforms show "Coming soon". */
  oauthReady: boolean;
}

const PLATFORMS: PlatformRow[] = [
  { key: 'youtube',   label: 'YouTube',   logo: `${STORAGE_BASE}/YouTubeLogo.png`,   oauthReady: true  },
  { key: 'kick',      label: 'Kick',      logo: `${STORAGE_BASE}/KickLogo.png`,      oauthReady: true  },
  { key: 'twitch',    label: 'Twitch',    logo: `${STORAGE_BASE}/TwitchLogo.png`,    oauthReady: true  },
  { key: 'instagram', label: 'Instagram', logo: `${STORAGE_BASE}/InstagramLogo.png`, oauthReady: true  },
  { key: 'tiktok',    label: 'TikTok',    logo: `${STORAGE_BASE}/TikTokLogo.png`,    oauthReady: true  },
  { key: 'x',         label: 'X',         logo: `${STORAGE_BASE}/XLogo.png`,         oauthReady: false },
  { key: 'facebook',  label: 'Facebook',  logo: `${STORAGE_BASE}/FacebookLogo.png`,  oauthReady: true  },
  { key: 'linkedin',  label: 'LinkedIn',  logo: `${STORAGE_BASE}/LinkedInLogo.png`,  oauthReady: false },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  userId: string;
  connectedPlatforms: Platform[];
}

export function SyncPlatformSheet({ visible, onClose, userId, connectedPlatforms }: Props) {
  const connectedSet = new Set(connectedPlatforms);

  const handleConnect = (p: PlatformRow) => {
    if (connectedSet.has(p.key)) return;
    if (!p.oauthReady) {
      Alert.alert(
        `${p.label} — coming soon`,
        `${p.label} OAuth integration is on the roadmap. We'll enable it once the integration is ready.`,
      );
      return;
    }
    if (!userId) {
      Alert.alert('Not signed in', 'Sign in before connecting a creator account.');
      return;
    }
    const url = buildOAuthStartUrl(
      p.key as 'youtube' | 'kick' | 'twitch' | 'instagram' | 'facebook' | 'tiktok',
      userId,
    );
    Linking.openURL(url).catch(() => {
      Alert.alert('Could not open browser', 'Please try again.');
    });
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      {/* Tap outside to dismiss */}
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Connect a platform</Text>
        <Text style={styles.subtitle}>
          Sync your channel to import videos and stats into your profile.
        </Text>

        <View style={styles.list}>
          {PLATFORMS.map((p) => {
            const isConnected = connectedSet.has(p.key);
            return (
              <Pressable
                key={p.key}
                style={({ pressed }) => [
                  styles.row,
                  pressed && !isConnected && styles.rowPressed,
                  isConnected && styles.rowConnected,
                ]}
                onPress={() => handleConnect(p)}
                disabled={isConnected}
                accessibilityRole="button"
                accessibilityLabel={isConnected ? `${p.label} already connected` : `Connect ${p.label}`}
              >
                <Image source={{ uri: p.logo }} style={styles.logo} resizeMode="contain" />
                <Text style={styles.label}>{p.label}</Text>
                {isConnected ? (
                  <View style={styles.statusRow}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                    <Text style={styles.connectedText}>Connected</Text>
                  </View>
                ) : p.oauthReady ? (
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                ) : (
                  <Text style={styles.soonText}>Soon</Text>
                )}
              </Pressable>
            );
          })}
        </View>

        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>Close</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing['2xl'],
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    fontSize: 13,
  },
  list: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowConnected: {
    opacity: 0.6,
  },
  rowPressed: {
    backgroundColor: colors.card,
  },
  logo: {
    width: 24,
    height: 24,
  },
  label: {
    ...typography.bodyBold,
    color: colors.text,
    flex: 1,
    fontSize: 14,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  connectedText: {
    ...typography.small,
    color: colors.success,
    fontSize: 12,
  },
  soonText: {
    ...typography.small,
    color: colors.textMuted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    fontSize: 11,
  },
  closeBtn: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  closeBtnText: {
    ...typography.bodyBold,
    color: colors.text,
    fontSize: 14,
  },
});
