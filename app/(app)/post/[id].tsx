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
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { postsService } from '@/services/posts';
import { queryClient } from '@/lib/queryClient';
import { PostCard } from '@/components/feed/PostCard';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, radius, typography } from '@/theme';
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
  const [commentText, setCommentText] = useState('');

  const { data: post, isLoading: postLoading } = useQuery({
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
      queryClient.invalidateQueries({ queryKey: ['comments', id] });
      queryClient.invalidateQueries({ queryKey: ['post', id] });
    },
  });

  const handleSend = () => {
    const text = commentText.trim();
    if (text) addComment.mutate(text);
  };

  const renderComment = useCallback(({ item }: { item: Comment }) => (
    <View style={styles.comment}>
      <Avatar uri={item.user?.avatar_url ?? null} name={item.user?.display_name} size={32} />
      <View style={styles.commentContent}>
        <View style={styles.commentHeader}>
          <Text style={styles.commentUser}>{item.user?.display_name ?? 'Unknown'}</Text>
          <Text style={styles.commentTime}>{timeAgo(item.created_at)}</Text>
        </View>
        <Text style={styles.commentBody}>{item.body}</Text>
      </View>
    </View>
  ), []);

  if (postLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!post) {
    return <EmptyState icon="alert-circle-outline" title="Post not found" />;
  }

  return (
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
        >
          <Ionicons
            name="send"
            size={22}
            color={commentText.trim() ? colors.primary : colors.textMuted}
          />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
