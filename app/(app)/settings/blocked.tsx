import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { moderationService, type BlockedUser } from '@/services/moderation';
import { colors, spacing, typography, radius } from '@/theme';

export default function BlockedUsersScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const {
    data: blocked,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['blocked-users'],
    queryFn: () => moderationService.listBlockedUsers(),
  });

  const unblockMutation = useMutation({
    mutationFn: (targetId: string) => moderationService.unblockUser(targetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blocked-users'] });
    },
    onError: (err: any) => {
      Alert.alert('Could not unblock', err.message ?? 'Please try again.');
    },
  });

  const handleUnblock = (user: BlockedUser) => {
    Alert.alert(
      `Unblock @${user.user.username}?`,
      "They'll be able to see your profile and posts again.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          style: 'destructive',
          onPress: () => unblockMutation.mutate(user.blocked_id),
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!blocked || blocked.length === 0) {
    return (
      <EmptyState
        icon="ban-outline"
        title="No blocked users"
        message="Anyone you block will appear here."
      />
    );
  }

  return (
    <FlatList
      data={blocked}
      keyExtractor={(item) => item.blocked_id}
      contentContainerStyle={styles.listContent}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={colors.primary}
        />
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Pressable
            style={styles.userTap}
            onPress={() => router.push(`/(app)/user/${item.blocked_id}`)}
            hitSlop={8}
          >
            <Avatar
              uri={item.user?.avatar_url ?? null}
              name={item.user?.display_name}
              size={44}
            />
            <View style={styles.userMeta}>
              <Text style={styles.displayName} numberOfLines={1}>
                {item.user?.display_name ?? 'Unknown user'}
              </Text>
              <Text style={styles.username} numberOfLines={1}>
                @{item.user?.username ?? 'unknown'}
              </Text>
            </View>
          </Pressable>
          <Pressable
            onPress={() => handleUnblock(item)}
            style={styles.unblockBtn}
            disabled={unblockMutation.isPending}
          >
            <Text style={styles.unblockText}>Unblock</Text>
          </Pressable>
        </View>
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListFooterComponent={() => <View style={{ height: spacing['2xl'] }} />}
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  listContent: {
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  userTap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  userMeta: {
    flex: 1,
    marginLeft: spacing.md,
  },
  displayName: {
    ...typography.bodyBold,
    color: colors.text,
  },
  username: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  unblockBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  unblockText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.text,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: spacing.lg + 44 + spacing.md,
  },
});
