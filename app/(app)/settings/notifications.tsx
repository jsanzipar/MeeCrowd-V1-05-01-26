import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { notificationsService } from '@/services/notifications';
import { queryClient } from '@/lib/queryClient';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, typography } from '@/theme';
import type { Notification } from '@/types';

const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
  like: 'heart',
  comment: 'chatbubble',
  follow: 'person-add',
  mention: 'at',
  featured: 'star',
};

const iconColorMap: Record<string, string> = {
  like: colors.error,
  comment: colors.info,
  follow: colors.primary,
  mention: colors.warning,
  featured: colors.warning,
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function NotificationsSettingsScreen() {
  const router = useRouter();

  const { data: notifications, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsService.getNotifications(),
  });

  const markRead = useMutation({
    mutationFn: notificationsService.markAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: notificationsService.markAllAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
    },
  });

  const handlePress = useCallback((notification: Notification) => {
    if (!notification.read_at) {
      markRead.mutate(notification.id);
    }
    if (notification.data?.post_id) {
      router.push(`/(app)/post/${notification.data.post_id}`);
    } else if (notification.data?.user_id) {
      router.push(`/(app)/user/${notification.data.user_id}`);
    }
  }, [markRead, router]);

  const unreadCount = (notifications ?? []).filter((n) => !n.read_at).length;

  const renderItem = useCallback(({ item }: { item: Notification }) => (
    <TouchableOpacity
      style={[styles.item, !item.read_at && styles.unread]}
      onPress={() => handlePress(item)}
    >
      <View style={[styles.iconCircle, { backgroundColor: (iconColorMap[item.type] ?? colors.primary) + '20' }]}>
        <Ionicons
          name={iconMap[item.type] ?? 'notifications'}
          size={18}
          color={iconColorMap[item.type] ?? colors.primary}
        />
      </View>
      <View style={styles.content}>
        <Text style={styles.notifTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.notifBody} numberOfLines={2}>{item.body}</Text>
      </View>
      <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
    </TouchableOpacity>
  ), [handlePress]);

  return (
    <View style={styles.container}>
      {/* Mark all read bar */}
      {unreadCount > 0 && (
        <View style={styles.actionBar}>
          <Text style={styles.unreadLabel}>{unreadCount} unread</Text>
          <TouchableOpacity onPress={() => markAllRead.mutate()}>
            <Text style={styles.markAll}>Mark all read</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={notifications ?? []}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : (
            <EmptyState
              icon="notifications-off-outline"
              title="No notifications"
              message="You're all caught up"
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  unreadLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  markAll: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  unread: {
    backgroundColor: colors.primary + '08',
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  notifTitle: {
    ...typography.bodyBold,
    color: colors.text,
  },
  notifBody: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  time: {
    ...typography.small,
    color: colors.textMuted,
  },
  loader: {
    marginTop: spacing['4xl'],
  },
});
