import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/ui/Avatar';
import { formatCount } from '@/lib/format';
import { colors, spacing, typography } from '@/theme';
import type { ExternalComment } from '@/types';

interface Props {
  comment: ExternalComment;
}

export function ExternalCommentItem({ comment }: Props) {
  return (
    <View style={styles.wrap}>
      <Avatar
        uri={comment.author_avatar_url}
        name={comment.author_display_name ?? '?'}
        size={32}
      />
      <View style={styles.body}>
        <Text style={styles.author}>
          {comment.author_display_name ?? comment.author_handle ?? 'Anonymous'}
        </Text>
        <Text style={styles.text}>{comment.body}</Text>
        <View style={styles.meta}>
          <View style={styles.likeRow}>
            <Ionicons name="thumbs-up-outline" size={12} color={colors.textMuted} />
            <Text style={styles.metaText}>{formatCount(comment.like_count)}</Text>
          </View>
          {comment.reply_count > 0 && (
            <Text style={styles.metaText}>
              · {comment.reply_count} {comment.reply_count === 1 ? 'reply' : 'replies'}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  body: {
    flex: 1,
  },
  author: {
    ...typography.bodyBold,
    color: colors.text,
    fontSize: 13,
  },
  text: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 2,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 6,
  },
  likeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    ...typography.small,
    color: colors.textMuted,
  },
});
