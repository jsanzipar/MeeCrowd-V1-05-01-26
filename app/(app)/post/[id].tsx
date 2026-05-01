import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { postsService } from '@/services/posts';
import { moderationService } from '@/services/moderation';
import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { PostCard } from '@/components/feed/PostCard';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ReportSheet } from '@/components/moderation/ReportSheet';
import { toast } from '@/lib/toast';
import { haptics } from '@/lib/haptics';
import { colors, spacing, typography } from '@/theme';
import type { Comment } from '@/types';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const currentUserId = useAuthStore((s) => s.session?.user?.id);
  const [commentText, setCommentText] = useState('');
  const [reportTarget, setReportTarget] = useState<
    | { target_type: 'post' | 'comment'; target_id: string }
    | null
  >(null);

  const {
    data: post,
    isLoading: postLoading,
    isError: postError,
    refetch: refetchPost,
  } = useQuery({
    queryKey: ['post', id],
    queryFn: () => postsService.getPost(id!),
    enabled: !!id,
  });

  const { data: comments, isLoading: commentsLoading } = useQuery({
    queryKey: ['comments', id],
    queryFn: () => postsService.getComments(id!),
    enabled: !!id,
  });

  const addComment = useMutation({
    mutationFn: (body: string) => postsService.addComment(id!, body),
    onSuccess: () => {
      setCommentText('');
      haptics.success();
      queryClient.invalidateQueries({ queryKey: ['comments', id] });
      queryClient.invalidateQueries({ queryKey: ['post', id] });
    },
    onError: (err: any) => {
      haptics.error();
      toast.fromError(err, "Couldn't post comment");
    },
  });

  const blockMutation = useMutation({
    mutationFn: (targetUserId: string) =>
      moderationService.blockUser(targetUserId),
    onSuccess: () => {
      haptics.success();
      toast.success({
        title: 'User blocked',
        message: "You won't see their content in your feed anymore.",
      });
      router.back();
    },
    onError: (err: any) => {
      haptics.error();
      toast.fromError(err, "Couldn't block user");
    },
  });

  const handleSend = () => {
    const text = commentText.trim();
    if (text) {
      haptics.light();
      addComment.mutate(text);
    }
  };

  const openPostMenu = () => {
    if (!post) return;
    const isOwn = post.user_id === currentUserId;
    const buttons: any[] = [
      {
        text: 'Report post',
        onPress: () =>
          setReportTarget({ target_type: 'post', target_id: post.id }),
      },
    ];
    if (!isOwn) {
      buttons.push({
        text: `Block @${post.user?.username ?? 'user'}`,
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            `Block @${post.user?.username ?? 'user'}?`,
            "They won't be able to see your profile, and you won't see theirs.",
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Block',
                style: 'destructive',
                onPress: () => blockMutation.mutate(post.user_id),
              },
            ]
          );
        },
      });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(post.title ?? 'Post', undefined, buttons, { cancelable: true });
  };

  const openCommentMenu = (comment: Comment) => {
    const isOwn = comment.user_id === currentUserId;
    if (isOwn) return; // nothing to do for own comment in MVP
    Alert.alert(
      comment.user?.display_name ?? 'Comment',
      undefined,
      [
        {
          text: 'Report comment',
          onPress: () =>
            setReportTarget({ target_type: 'comment', target_id: comment.id }),
        },
        {
          text: `Block @${comment.user?.username ?? 'user'}`,
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              `Block @${comment.user?.username ?? 'user'}?`,
              "They won't be able to see your profile, and you won't see theirs.",
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Block',
                  style: 'destructive',
                  onPress: () => blockMutation.mutate(comment.user_id),
                },
              ]
            );
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true }
    );
  };

  const renderComment = useCallback(
    ({ item }: { item: Comment }) => {
      const isOwn = item.user_id === currentUserId;
      return (
        <View style={styles.comment}>
          <Avatar
            uri={item.user?.avatar_url ?? null}
            name={item.user?.display_name}
            size={32}
          />
          <View style={styles.commentContent}>
            <View style={styles.commentHeader}>
              <Text style={styles.commentUser}>
                {item.user?.display_name ?? 'Unknown'}
              </Text>
              <Text style={styles.commentTime}>{timeAgo(item.created_at)}</Text>
              {!isOwn && (
                <Pressable
                  onPress={() => openCommentMenu(item)}
                  style={styles.commentMenu}
                  hitSlop={10}
                  accessibilityLabel="More options"
                >
                  <Ionicons
                    name="ellipsis-horizontal"
                    size={16}
                    color={colors.textMuted}
                  />
                </Pressable>
              )}
            </View>
            <Text style={styles.commentBody}>{item.body}</Text>
          </View>
        </View>
      );
    },
    [currentUserId]
  );

  if (postLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (postError) {
    return <ErrorState onRetry={refetchPost} />;
  }

  if (!post) {
    return <EmptyState icon="alert-circle-outline" title="Post not found" />;
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={openPostMenu}
              style={styles.headerBtn}
              hitSlop={10}
              accessibilityLabel="More options"
            >
              <Ionicons
                name="ellipsis-horizontal"
                size={22}
                color={colors.text}
              />
            </Pressable>
          ),
        }}
      />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <FlatList
          data={comments ?? []}
          renderItem={renderComment}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.postWrapper}>
              <PostCard post={post} />
              <View style={styles.commentsHeader}>
                <Text style={styles.commentsTitle}>
                  Comments ({post.comment_count})
                </Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            commentsLoading ? (
              <ActivityIndicator color={colors.primary} style={styles.loader} />
            ) : (
              <EmptyState
                icon="chatbubble-outline"
                title="No comments yet"
                message="Be the first to comment"
              />
            )
          }
        />

        {/* Comment input */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            placeholder="Write a comment..."
            placeholderTextColor={colors.textMuted}
            value={commentText}
            onChangeText={setCommentText}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!commentText.trim() || addComment.isPending}
            style={styles.sendBtn}
            accessibilityRole="button"
            accessibilityLabel="Send comment"
            accessibilityState={{ disabled: !commentText.trim() || addComment.isPending }}
          >
            <Ionicons
              name="send"
              size={22}
              color={commentText.trim() ? colors.primary : colors.textMuted}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <ReportSheet
        visible={!!reportTarget}
        onClose={() => setReportTarget(null)}
        target={reportTarget ?? { target_type: 'post', target_id: id! }}
      />
    </>
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
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingBottom: spacing.lg,
  },
  postWrapper: {
    paddingTop: spacing.md,
  },
  commentsHeader: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  commentsTitle: {
    ...typography.h3,
    color: colors.text,
  },
  comment: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  commentContent: {
    flex: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  commentUser: {
    ...typography.bodyBold,
    color: colors.text,
    fontSize: 13,
  },
  commentTime: {
    ...typography.small,
    color: colors.textMuted,
    flex: 1,
  },
  commentMenu: {
    padding: 4,
  },
  commentBody: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 2,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  textInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    maxHeight: 100,
    paddingVertical: spacing.sm,
  },
  sendBtn: {
    padding: spacing.sm,
  },
  loader: {
    marginTop: spacing.xl,
  },
});
