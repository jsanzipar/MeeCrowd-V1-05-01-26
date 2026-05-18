// LatestRowCard — renders a row from the `latest_feed` SQL view.
//
// The view is a flat UNION of two sources (native MeeCrowd posts and
// external content from synced/manual creator channels). We hydrate each
// row into the matching detail object and dispatch to the existing card
// component (PostCard or ExternalContentRow) so the card UX stays
// consistent across feed surfaces.
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { PostCard } from '@/components/feed/PostCard';
import { ExternalContentRow } from '@/components/aggregation/ExternalContentRow';
import { postsService } from '@/services/posts';
import { aggregationService } from '@/services/aggregation';
import type { LatestFeedRow } from '@/types';

interface Props {
  row: LatestFeedRow;
}

export function LatestRowCard({ row }: Props) {
  if (row.source === 'post') return <NativePostHydrator id={row.id} />;
  return <ExternalContentHydrator id={row.id} />;
}

function NativePostHydrator({ id }: { id: string }) {
  const { data } = useQuery({
    queryKey: ['post-detail', id],
    queryFn: () => postsService.getPost(id),
    staleTime: 60_000,
  });
  if (!data) return null;
  return <PostCard post={data} />;
}

function ExternalContentHydrator({ id }: { id: string }) {
  const { data } = useQuery({
    queryKey: ['external-content', id],
    queryFn: () => aggregationService.getContent(id),
    staleTime: 60_000,
  });
  if (!data) return null;
  return <ExternalContentRow content={data} />;
}
