// React Query hooks for creator-sync state.
import { useQuery, useMutation } from '@tanstack/react-query';
import { creatorService, type ProfileFeedScope } from '@/services/creator';
import { queryClient } from '@/lib/queryClient';
import type { Platform } from '@/types';

export function useMyCreatorConnections() {
  return useQuery({
    queryKey: ['creator-connections'],
    queryFn: () => creatorService.getMyConnections(),
  });
}

export function useSyncCreatorContent() {
  return useMutation({
    mutationFn: (platform: 'youtube' | 'kick' | 'twitch') => creatorService.syncContent(platform),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-feed'] });
      queryClient.invalidateQueries({ queryKey: ['user-posts'] });
    },
  });
}

export function useProfileFeed(userId: string, scope: ProfileFeedScope) {
  return useQuery({
    queryKey: ['profile-feed', userId, scope],
    queryFn: () => creatorService.getProfileFeed(userId, scope),
    enabled: !!userId,
  });
}

export function useCreatorStats(userId: string) {
  return useQuery({
    queryKey: ['creator-stats', userId],
    queryFn: () => creatorService.getCreatorStats(userId),
    enabled: !!userId,
    staleTime: 30_000,
  });
}

export function useDisconnectCreator() {
  return useMutation({
    mutationFn: (platform: Platform) => creatorService.disconnect(platform),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creator-connections'] });
      queryClient.invalidateQueries({ queryKey: ['profile-feed'] });
    },
  });
}
