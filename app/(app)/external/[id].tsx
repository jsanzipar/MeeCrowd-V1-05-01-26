// Generic landing for an external (ingested) channel that hasn't been
// claimed by a MeeCrowd user yet.
//
// If the channel HAS been claimed (user_id is set), redirect to the
// MeeCrowd profile route — this lets us pass channel_id everywhere from
// LivePostCard and have the routing decision happen here.
import React, { useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/ui/Avatar';
import { ExternalContentRow } from '@/components/aggregation/ExternalContentRow';
import { PlatformBadge } from '@/components/feed/PlatformBadge';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  useAggregatedChannel,
  useChannelContent,
} from '@/hooks/useAggregation';
import { formatCount } from '@/lib/format';
import { colors, spacing, radius, typography } from '@/theme';
import type { Platform } from '@/types';

export default function ExternalProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const channelQ = useAggregatedChannel(id);
  const contentQ = useChannelContent(id);

  // If the channel has been claimed, redirect to the MeeCrowd profile.
  // useEffect because we can't call router.replace during render.
  useEffect(() => {
    if (channelQ.data?.user_id) {
      router.replace({
        pathname: '/(app)/user/[id]',
        params: { id: channelQ.data.user_id },
      });
    }
  }, [channelQ.data?.user_id, router]);

  if (channelQ.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }
  if (channelQ.isError || !channelQ.data) {
    return <ErrorState onRetry={() => channelQ.refetch()} />;
  }

  // Brief flash before redirect — show a spinner instead of empty content.
  if (channelQ.data.user_id) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const channel = channelQ.data;
  const platform = (channel.platform?.slug as Platform) ?? 'youtube';
  const platformName = channel.platform?.display_name ?? channel.platform?.slug ?? '';

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: channel.display_name ?? channel.handle ?? 'Channel',
        }}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        {/* Header */}
        <View style={styles.header}>
          <Avatar
            uri={channel.avatar_url}
            name={channel.display_name ?? '?'}
            size={88}
          />
          <Text style={styles.name}>{channel.display_name ?? channel.handle}</Text>

          <PlatformBadge platform={platform} size={20} />

          {channel.handle && channel.handle !== channel.display_name ? (
            <Text style={styles.handle}>{channel.handle}</Text>
          ) : null}

          <Text style={styles.subscribers}>
            <Text style={styles.subscribersValue}>
              {formatCount(channel.subscriber_count)}
            </Text>{' '}
            subscribers
          </Text>
        </View>

        {/* "Not synced" notice — minimal, no wrapper */}
        <Text style={styles.notSyncedTitle}>
          User not synced to MeeCrowd yet
        </Text>
        <Text style={styles.notSyncedBody}>
          We're showing public data ingested from {platformName}. When this
          creator joins MeeCrowd, you'll be able to follow them and see their
          full activity here.
        </Text>

        {/* Open externally */}
        {channel.channel_url ? (
          <Pressable
            style={styles.openExternal}
            onPress={() => Linking.openURL(channel.channel_url!)}
            accessibilityRole="button"
            accessibilityLabel={`Open on ${platformName}`}
          >
            <Ionicons name="open-outline" size={16} color={colors.text} />
            <Text style={styles.openText}>Open on {platformName}</Text>
          </Pressable>
        ) : null}

        {/* Recent content — compact rows matching mockup profile past events */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent</Text>
        </View>
        {contentQ.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
        ) : contentQ.data && contentQ.data.length > 0 ? (
          contentQ.data.slice(0, 8).map((c) => (
            <ExternalContentRow key={c.id} content={c} />
          ))
        ) : (
          <EmptyState icon="film-outline" title="No recent uploads cached" />
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: spacing['5xl'],
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  name: {
    ...typography.h2,
    color: colors.text,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  platformPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  platformText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  handle: {
    ...typography.body,
    color: colors.textMuted,
  },
  subscribers: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  subscribersValue: {
    ...typography.bodyBold,
    color: colors.text,
    fontSize: 18,
  },
  notSyncedTitle: {
    ...typography.h3,
    color: colors.text,
    paddingHorizontal: spacing.lg,
  },
  notSyncedBody: {
    ...typography.body,
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
    marginTop: 4,
    lineHeight: 20,
  },
  openExternal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  openText: {
    ...typography.bodyBold,
    color: colors.text,
  },
  sectionHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.xl,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
  },
  list: {
    paddingHorizontal: spacing.lg,
  },
});
