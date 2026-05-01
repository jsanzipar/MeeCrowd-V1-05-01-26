import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Linking,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/ui/Avatar';
import { EmbedPlayer } from '@/components/aggregation/EmbedPlayer';
import { ExternalCommentItem } from '@/components/aggregation/ExternalCommentItem';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  useAggregatedContent,
  useAggregatedComments,
} from '@/hooks/useAggregation';
import { formatCount } from '@/lib/format';
import { colors, spacing, typography, radius } from '@/theme';

const PLATFORM_COLOR: Record<string, string> = {
  youtube: colors.youtube,
  twitch: colors.twitch,
  kick: colors.kick,
};

export default function ContentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const contentQ = useAggregatedContent(id);
  const commentsQ = useAggregatedComments(id);

  if (contentQ.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }
  if (contentQ.isError || !contentQ.data) {
    return <ErrorState onRetry={() => contentQ.refetch()} />;
  }

  const content = contentQ.data;
  const channel = content.channel;
  const slug = content.platform?.slug ?? '';
  const platformColor = PLATFORM_COLOR[slug] ?? colors.primary;
  const platformName = content.platform?.display_name ?? slug;
  const m = content.latest_metrics;
  const refreshing = contentQ.isFetching || commentsQ.isFetching;

  return (
    <>
      <Stack.Screen options={{ headerTitle: platformName }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              contentQ.refetch();
              commentsQ.refetch();
            }}
            tintColor={colors.primary}
          />
        }
      >
        {/* Embed player */}
        {content.embed_url ? (
          <View style={styles.playerWrap}>
            <EmbedPlayer embedUrl={content.embed_url} />
          </View>
        ) : null}

        {/* Title + meta */}
        <View style={styles.body}>
          <Text style={styles.title}>{content.title ?? 'Untitled'}</Text>

          <View style={styles.statsRow}>
            {content.is_live && m?.current_viewer_count != null ? (
              <View style={styles.statPill}>
                <View style={styles.liveDot} />
                <Text style={styles.statText}>
                  {formatCount(m.current_viewer_count)} watching
                </Text>
              </View>
            ) : m?.view_count != null ? (
              <View style={styles.statPill}>
                <Ionicons name="eye-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.statText}>
                  {formatCount(m.view_count)} views
                </Text>
              </View>
            ) : null}
            {m?.like_count != null && (
              <View style={styles.statPill}>
                <Ionicons name="thumbs-up-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.statText}>{formatCount(m.like_count)}</Text>
              </View>
            )}
            {m?.comment_count != null && (
              <View style={styles.statPill}>
                <Ionicons
                  name="chatbubble-outline"
                  size={14}
                  color={colors.textSecondary}
                />
                <Text style={styles.statText}>{formatCount(m.comment_count)}</Text>
              </View>
            )}
          </View>

          {/* Channel attribution */}
          {channel && (
            <Pressable
              style={styles.channelRow}
              onPress={() =>
                router.push({
                  pathname: '/(app)/aggregation/channel/[id]',
                  params: { id: channel.id },
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`Open channel ${channel.display_name}`}
            >
              <Avatar
                uri={channel.avatar_url}
                name={channel.display_name ?? '?'}
                size={40}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.channelName} numberOfLines={1}>
                  {channel.display_name}
                </Text>
                <Text style={styles.channelMeta}>
                  {formatCount(channel.subscriber_count)} subscribers
                </Text>
              </View>
              <View style={[styles.platformPill, { backgroundColor: platformColor }]}>
                <Text style={styles.platformText}>{platformName}</Text>
              </View>
            </Pressable>
          )}

          {/* Open externally */}
          {content.url ? (
            <Pressable
              style={styles.openExternal}
              onPress={() => Linking.openURL(content.url!)}
              accessibilityRole="button"
              accessibilityLabel={`Open on ${platformName}`}
            >
              <Ionicons
                name="open-outline"
                size={16}
                color={colors.text}
              />
              <Text style={styles.openText}>Open on {platformName}</Text>
            </Pressable>
          ) : null}

          {/* Description */}
          {content.description ? (
            <Text style={styles.description} numberOfLines={6}>
              {content.description}
            </Text>
          ) : null}
        </View>

        {/* Comments */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Top Comments</Text>
          <Text style={styles.commentsNote}>cached sample</Text>
        </View>
        {commentsQ.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : commentsQ.data && commentsQ.data.length > 0 ? (
          commentsQ.data.map((c) => (
            <ExternalCommentItem key={c.id} comment={c} />
          ))
        ) : (
          <EmptyState
            icon="chatbubble-outline"
            title="No comments cached"
            message="Comments may be disabled or not yet ingested."
          />
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
  playerWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  title: {
    ...typography.h2,
    color: colors.text,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.error,
  },
  statText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  channelName: {
    ...typography.bodyBold,
    color: colors.text,
  },
  channelMeta: {
    ...typography.caption,
    color: colors.textMuted,
  },
  platformPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  platformText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
  openExternal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  openText: {
    ...typography.bodyBold,
    color: colors.text,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.lg,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
  },
  commentsNote: {
    ...typography.caption,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
});
