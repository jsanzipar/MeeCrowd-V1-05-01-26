import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Avatar } from '@/components/ui/Avatar';
import { ContentTile } from '@/components/aggregation/ContentTile';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import {
  useAggregatedChannel,
  useChannelContent,
} from '@/hooks/useAggregation';
import { formatCount } from '@/lib/format';
import { colors, spacing, typography, radius } from '@/theme';

const PLATFORM_COLOR: Record<string, string> = {
  youtube: colors.youtube,
  twitch: colors.twitch,
  kick: colors.kick,
};

export default function ChannelDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const channelQ = useAggregatedChannel(id);
  const contentQ = useChannelContent(id);

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

  const channel = channelQ.data;
  const slug = channel.platform?.slug ?? '';
  const platformColor = PLATFORM_COLOR[slug] ?? colors.primary;
  const platformName = channel.platform?.display_name ?? slug;
  const refreshing = channelQ.isFetching || contentQ.isFetching;

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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              channelQ.refetch();
              contentQ.refetch();
            }}
            tintColor={colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Avatar
            uri={channel.avatar_url}
            name={channel.display_name ?? '?'}
            size={88}
          />
          <Text style={styles.name}>{channel.display_name}</Text>
          <View style={[styles.platformPill, { backgroundColor: platformColor }]}>
            <Text style={styles.platformText}>{platformName}</Text>
          </View>
          {channel.handle ? (
            <Text style={styles.handle}>{channel.handle}</Text>
          ) : null}
          <View style={styles.statsRow}>
            <Stat label="Subscribers" value={formatCount(channel.subscriber_count)} />
            <Stat label="Total views" value={formatCount(channel.total_view_count)} />
            <Stat label="Videos" value={channel.video_count.toLocaleString()} />
          </View>
          {channel.description ? (
            <Text style={styles.bio} numberOfLines={4}>
              {channel.description}
            </Text>
          ) : null}
        </View>

        {/* Content list */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent</Text>
        </View>
        <View style={styles.list}>
          {contentQ.isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
          ) : contentQ.data && contentQ.data.length > 0 ? (
            contentQ.data.map((c) => (
              <ContentTile
                key={c.id}
                content={c}
                onPress={() =>
                  router.push({
                    pathname: '/(app)/aggregation/content/[id]',
                    params: { id: c.id },
                  })
                }
              />
            ))
          ) : (
            <EmptyState
              icon="film-outline"
              title="No videos cached yet"
              message="Run the ingest worker to fetch recent uploads."
            />
          )}
        </View>
      </ScrollView>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
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
  handle: {
    ...typography.body,
    color: colors.textMuted,
  },
  platformPill: {
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
  statsRow: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginTop: spacing.md,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    ...typography.h3,
    color: colors.text,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  bio: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  sectionHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
  },
  list: {
    paddingHorizontal: spacing.lg,
  },
});
