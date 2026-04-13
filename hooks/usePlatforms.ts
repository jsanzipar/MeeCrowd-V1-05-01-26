import { useQuery } from '@tanstack/react-query';
import { platformsService } from '@/services/platforms';

export function useMyPlatformAccounts() {
  return useQuery({
    queryKey: ['my-platform-accounts'],
    queryFn: () => platformsService.getMyAccounts(),
  });
}

export function usePlatformMetrics(userId: string) {
  return useQuery({
    queryKey: ['platform-metrics', userId],
    queryFn: () => platformsService.getMetrics(userId),
    enabled: !!userId,
  });
}

export function usePlatformSummaries(userId: string) {
  return useQuery({
    queryKey: ['platform-summaries', userId],
    queryFn: () => platformsService.getUserPlatformSummaries(userId),
    enabled: !!userId,
  });
}

export function useMetricsHistory(platformAccountId: string, days = 30) {
  return useQuery({
    queryKey: ['metrics-history', platformAccountId, days],
    queryFn: () => platformsService.getMetricsHistory(platformAccountId, days),
    enabled: !!platformAccountId,
  });
}
