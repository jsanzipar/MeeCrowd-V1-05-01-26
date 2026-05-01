import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useLiveNow, useAggregatedChannels } from '@/hooks/useAggregation';
import { LiveCard } from '@/components/aggregation/LiveCard';
import { ChannelCard } from '@/components/aggregation/ChannelCard';
import { PostListSkeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, typography } from '@/theme';

export default function AggregationIndexScreen() {
  const router = useRouter();
  const live = useLiveNow();
  const channels = useAggregatedChannels();

  const refreshing = live.isFetching || channels.isFetching;
  const onRefresh = () => {
    live.refetch();
    channels.refetch();
  };

  if (channels.isError) {
    return <ErrorState onRetry={() => channels.refetch()} />;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    >
      {/* Live Now */}
      <View style={styles.sectionHeader}>
        <View style={styles.liveDotLg} />
        <Text style={styles.sectionTitle}>Live Now</Text>
        {live.data?.length ? (
          <Text style={styles.count}>{live.data.length}</Text>
        ) : null}
      </View>
      {live.isLoading ? (
        <View style={styles.liveLoading}>
          <View style={styles.liveSkel} />
          <View style={styles.liveSkel} />
        </View>
      ) : live.data && live.data.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.liveScroll}
        >
          {live.data.map((row) => (
            <LiveCard
              key={row.content_id}
              row={row}
              onPress={() =>
                router.push({
                  pathname: '/(app)/aggregation/content/[id]',
                  params: { id: row.content_id },
                })
              }
            />
          ))}
        </ScrollView>
      ) : (
        <View style={styles.emptyLive}>
          <Text style={styles.emptyText}>No streams live right now.</Text>
        </View>
      )}

      {/* Channels */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Channels</Text>
        {channels.data?.length ? (
          <Text style={styles.count}>{channels.data.length}</Text>
        ) : null}
      </View>
      {channels.isLoading ? (
        <PostListSkeleton count={4} />
      ) : !channels.data || channels.data.length === 0 ? (
        <EmptyState
          icon="cloud-outline"
          title="No channels yet"
          message="Run the ingest scripts to populate aggregation data."
        />
      ) : (
        channels.data.map((c) => (
          <ChannelCard
            key={c.id}
            channel={c}
            onPress={() =>
              router.push({
                pathname: '/(app)/aggregation/channel/[id]',
                params: { id: c.id },
              })
            }
          />
        ))
      )}
    </ScrollView>
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.h2,
    color: colors.text,
  },
  count: {
    ...typography.caption,
    color: colors.textMuted,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 10,
  },
  liveDotLg: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.error,
  },
  liveScroll: {
    paddingHorizontal: spacing.lg,
  },
  liveLoading: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  liveSkel: {
    width: 240,
    height: 135 + 50,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  emptyLive: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
  },
});
