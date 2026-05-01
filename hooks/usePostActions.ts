import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { postsService } from '@/services/posts';
import { toast } from '@/lib/toast';
import { haptics } from '@/lib/haptics';
import type { Post } from '@/types';

/**
 * Centralizes optimistic like/bookmark toggles so every list (feed,
 * bookmarks, search, user profile) flips instantly instead of waiting on
 * a Supabase round-trip.
 *
 * The tricky bit: some queries are InfiniteQuery (shape: { pages, pageParams }),
 * others are flat arrays. `mutatePostEverywhere` walks the whole cache and
 * updates any matching Post in either shape.
 */

type InfiniteData = { pages: Post[][]; pageParams: unknown[] };

function isInfinite(data: unknown): data is InfiniteData {
  return (
    typeof data === 'object' &&
    data !== null &&
    Array.isArray((data as InfiniteData).pages)
  );
}

function isPostArray(data: unknown): data is Post[] {
  return Array.isArray(data) && (data.length === 0 || 'id' in (data[0] as any));
}

export function usePostActions() {
  const queryClient = useQueryClient();

  /**
   * Walks every cached query and applies `updater` to any Post with a
   * matching id. Returns a rollback function that restores the previous
   * cache state — use it if the server call fails.
   */
  const mutatePostEverywhere = useCallback(
    (postId: string, updater: (post: Post) => Post) => {
      const snapshots: [readonly unknown[], unknown][] = [];

      queryClient.getQueryCache().getAll().forEach((q) => {
        const data = q.state.data;
        if (data === undefined) return;

        if (isInfinite(data)) {
          const hasMatch = data.pages.some((p) =>
            p.some((post) => post.id === postId)
          );
          if (!hasMatch) return;
          snapshots.push([q.queryKey, data]);
          queryClient.setQueryData(q.queryKey, {
            ...data,
            pages: data.pages.map((page) =>
              page.map((post) => (post.id === postId ? updater(post) : post))
            ),
          });
          return;
        }

        if (isPostArray(data)) {
          const hasMatch = data.some((post) => post.id === postId);
          if (!hasMatch) return;
          snapshots.push([q.queryKey, data]);
          queryClient.setQueryData(
            q.queryKey,
            data.map((post) => (post.id === postId ? updater(post) : post))
          );
          return;
        }

        // Single-post queries (['post', id])
        if (
          typeof data === 'object' &&
          data !== null &&
          'id' in (data as any) &&
          (data as any).id === postId
        ) {
          snapshots.push([q.queryKey, data]);
          queryClient.setQueryData(q.queryKey, updater(data as Post));
        }
      });

      return () => {
        for (const [key, prev] of snapshots) {
          queryClient.setQueryData(key, prev);
        }
      };
    },
    [queryClient]
  );

  const toggleLike = useCallback(
    async (post: Post) => {
      haptics.light();
      const nowLiked = !post.is_liked;

      const rollback = mutatePostEverywhere(post.id, (p) => ({
        ...p,
        is_liked: nowLiked,
        like_count: Math.max(0, (p.like_count ?? 0) + (nowLiked ? 1 : -1)),
      }));

      try {
        if (post.is_liked) {
          await postsService.unlikePost(post.id);
        } else {
          await postsService.likePost(post.id);
        }
      } catch (err) {
        rollback();
        toast.error({
          title: nowLiked ? "Couldn't like post" : "Couldn't unlike post",
          message: 'Please try again.',
        });
      }
    },
    [mutatePostEverywhere]
  );

  const toggleBookmark = useCallback(
    async (post: Post) => {
      haptics.light();
      const nowSaved = !post.is_bookmarked;

      const rollback = mutatePostEverywhere(post.id, (p) => ({
        ...p,
        is_bookmarked: nowSaved,
      }));

      // Also drop the post from the ['bookmarked-posts'] list immediately
      // when unsaving (so the Saved tab animates out without waiting for
      // a refetch).
      let savedListSnapshot: Post[] | undefined;
      if (!nowSaved) {
        savedListSnapshot = queryClient.getQueryData<Post[]>(['bookmarked-posts']);
        queryClient.setQueryData<Post[]>(['bookmarked-posts'], (old) =>
          old ? old.filter((p) => p.id !== post.id) : old
        );
      }

      try {
        if (post.is_bookmarked) {
          await postsService.unbookmarkPost(post.id);
        } else {
          await postsService.bookmarkPost(post.id);
        }
        // Refresh the Saved list so newly bookmarked items appear there.
        if (nowSaved) {
          queryClient.invalidateQueries({ queryKey: ['bookmarked-posts'] });
        }
      } catch (err) {
        rollback();
        if (savedListSnapshot !== undefined) {
          queryClient.setQueryData(['bookmarked-posts'], savedListSnapshot);
        }
        toast.error({
          title: nowSaved ? "Couldn't save post" : "Couldn't unsave post",
          message: 'Please try again.',
        });
      }
    },
    [mutatePostEverywhere, queryClient]
  );

  return { toggleLike, toggleBookmark };
}
