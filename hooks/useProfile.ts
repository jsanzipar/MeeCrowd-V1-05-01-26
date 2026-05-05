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

export function useMeecrowdFollowerCount(userId: string) {
  return useQuery({
    queryKey: ['meecrowd-follower-count', userId],
    queryFn: () => usersService.getMeecrowdFollowerCount(userId),
    enabled: !!userId,
    staleTime: 30_000,
  });
}

export function useIsFollowing(userId: string) {
  return useQuery({
    queryKey: ['is-following', userId],
    queryFn: () => usersService.isFollowing(userId),
    enabled: !!userId,
  });
}
