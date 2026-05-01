import { useQuery } from '@tanstack/react-query';
import { aggregationService } from '@/services/aggregation';

const STALE_60S = 60_000;
const STALE_5M = 5 * 60_000;

export function useLiveNow() {
  return useQuery({
    queryKey: ['agg', 'live-now'],
    queryFn: () => aggregationService.getLiveNow(),
    refetchInterval: STALE_60S,
    staleTime: STALE_60S,
  });
}

export function useAggregatedChannels() {
  return useQuery({
    queryKey: ['agg', 'channels'],
    queryFn: () => aggregationService.listChannels(),
    staleTime: STALE_5M,
  });
}

export function useAggregatedChannel(channelId: string | undefined) {
  return useQuery({
    queryKey: ['agg', 'channel', channelId],
    queryFn: () => aggregationService.getChannel(channelId!),
    enabled: !!channelId,
    staleTime: STALE_5M,
  });
}

export function useChannelContent(channelId: string | undefined) {
  return useQuery({
    queryKey: ['agg', 'channel-content', channelId],
    queryFn: () => aggregationService.getChannelContent(channelId!),
    enabled: !!channelId,
    staleTime: STALE_60S,
  });
}

export function useAggregatedContent(contentId: string | undefined) {
  return useQuery({
    queryKey: ['agg', 'content', contentId],
    queryFn: () => aggregationService.getContent(contentId!),
    enabled: !!contentId,
    staleTime: STALE_60S,
  });
}

export function useAggregatedComments(contentId: string | undefined) {
  return useQuery({
    queryKey: ['agg', 'comments', contentId],
    queryFn: () => aggregationService.getContentComments(contentId!),
    enabled: !!contentId,
    staleTime: STALE_5M,
  });
}
