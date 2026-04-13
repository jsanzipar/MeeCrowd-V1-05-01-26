import { useInfiniteQuery } from '@tanstack/react-query';
import { postsService } from '@/services/posts';
import type { FeedTab } from '@/types';

export function useFeed(tab: FeedTab) {
  return useInfiniteQuery({
    queryKey: ['feed', tab],
    queryFn: ({ pageParam = 0 }) => postsService.getFeed(tab, pageParam),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === 20 ? allPages.length : undefined,
    initialPageParam: 0,
  });
}

export function useUserPosts(userId: string) {
  return useInfiniteQuery({
    queryKey: ['user-posts', userId],
    queryFn: ({ pageParam = 0 }) => postsService.getUserPosts(userId, pageParam),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === 20 ? allPages.length : undefined,
    initialPageParam: 0,
    enabled: !!userId,
  });
}
