import { useQuery } from '@tanstack/react-query';
import { usersService } from '@/services/users';

export function useProfile(userId: string) {
  return useQuery({
    queryKey: ['profile', userId],
    queryFn: () => usersService.getProfile(userId),
    enabled: !!userId,
  });
}

export function useCrowdStats(userId: string) {
  return useQuery({
    queryKey: ['crowd-stats', userId],
    queryFn: () => usersService.getCrowdStats(userId),
    enabled: !!userId,
  });
}

export function useIsFollowing(userId: string) {
  return useQuery({
    queryKey: ['is-following', userId],
    queryFn: () => usersService.isFollowing(userId),
    enabled: !!userId,
  });
}
