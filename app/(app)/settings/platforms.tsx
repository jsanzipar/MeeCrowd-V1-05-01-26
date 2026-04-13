import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { useMyPlatformAccounts } from '@/hooks/usePlatforms';
import { platformsService } from '@/services/platforms';
import { queryClient } from '@/lib/queryClient';
import { Avatar } from '@/components/ui/Avatar';
import { colors, spacing, radius, typography } from '@/theme';
import type { Platform, PlatformAccount } from '@/types';

const platformConfig: Record<Platform, {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}> = {
  youtube: { label: 'YouTube', icon: 'logo-youtube', color: colors.youtube },
  twitch: { label: 'Twitch', icon: 'logo-twitch', color: colors.twitch },
  kick: { label: 'Kick', icon: 'game-controller', color: colors.kick },
  instagram: { label: 'Instagram', icon: 'logo-instagram', color: colors.instagram },
};

const allPlatforms: Platform[] = ['youtube', 'twitch', 'kick', 'instagram'];

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

export default function PlatformsScreen() {
  const { data: accounts, isLoading } = useMyPlatformAccounts();

  const disconnectMutation = useMutation({
    mutationFn: platformsService.disconnectAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-platform-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['crowd-stats'] });
    },
  });

  const connectedMap = new Map<Platform, PlatformAccount>();
  for (const account of accounts ?? []) {
    connectedMap.set(account.platform, account);
  }

  const handleConnect = (platform: Platform) => {
    // TODO: Launch OAuth flow for the specific platform
    // This will open the platform's OAuth consent screen, get a code,
    // exchange it for tokens via a Supabase Edge Function, then call
    // platformsService.connectAccount() with the tokens.
    Alert.alert(
      `Connect ${platformConfig[platform].label}`,
      `OAuth integration for ${platformConfig[platform].label} will be set up with an Edge Function.\n\nThis will:\n1. Open the ${platformConfig[platform].label} login\n2. Ask for permission to read your stats\n3. Sync your followers, views, likes, etc.`,
      [{ text: 'OK' }]
    );
  };

  const handleDisconnect = (platform: Platform) => {
    Alert.alert(
      `Disconnect ${platformConfig[platform].label}?`,
      'Your stats from this platform will be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => disconnectMutation.mutate(platform),
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Connected Platforms</Text>
      <Text style={styles.subtext}>
        Link your social accounts to aggregate your crowd stats and content.
      </Text>

      <FlatList
        data={allPlatforms}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.list}
        renderItem={({ item: platform }) => {
          const cfg = platformConfig[platform];
          const account = connectedMap.get(platform);
          const isConnected = !!account;

          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconCircle, { backgroundColor: cfg.color + '20' }]}>
                  <Ionicons name={cfg.icon} size={24} color={cfg.color} />
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.platformName}>{cfg.label}</Text>
                  {isConnected ? (
                    <View style={styles.connectedRow}>
                      <Text style={styles.connectedUser}>
                        @{account.platform_username}
                      </Text>
                      {account.is_verified && (
                        <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                      )}
                    </View>
                  ) : (
                    <Text style={styles.notConnected}>Not connected</Text>
                  )}
                </View>

                {isConnected ? (
                  <TouchableOpacity
                    style={styles.disconnectBtn}
                    onPress={() => handleDisconnect(platform)}
                  >
                    <Ionicons name="close-circle" size={22} color={colors.error} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.connectBtn, { borderColor: cfg.color }]}
                    onPress={() => handleConnect(platform)}
                  >
                    <Text style={[styles.connectText, { color: cfg.color }]}>Connect</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Show synced metrics if connected */}
              {isConnected && (
                <View style={styles.metricsRow}>
                  <View style={styles.metric}>
                    <Text style={styles.metricValue}>—</Text>
                    <Text style={styles.metricLabel}>Followers</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricValue}>—</Text>
                    <Text style={styles.metricLabel}>Views</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricValue}>—</Text>
                    <Text style={styles.metricLabel}>Likes</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricValue}>—</Text>
                    <Text style={styles.metricLabel}>Content</Text>
                  </View>
                </View>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  heading: {
    ...typography.h2,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  subtext: {
    ...typography.body,
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  list: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing['4xl'],
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
  },
  platformName: {
    ...typography.bodyBold,
    color: colors.text,
  },
  connectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  connectedUser: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  notConnected: {
    ...typography.caption,
    color: colors.textMuted,
  },
  connectBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  connectText: {
    ...typography.caption,
    fontWeight: '700',
  },
  disconnectBtn: {
    padding: spacing.sm,
  },
  metricsRow: {
    flexDirection: 'row',
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    justifyContent: 'space-around',
  },
  metric: {
    alignItems: 'center',
  },
  metricValue: {
    ...typography.bodyBold,
    color: colors.text,
  },
  metricLabel: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 2,
  },
});
