import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle, Easing } from 'react-native';
import { colors, radius, spacing } from '@/theme';

/**
 * Shimmer skeleton block. Subtle pulse animation — opacity only, no gradient
 * sweep. Gradient sweeps look great on iOS but chug on react-native-web, so
 * we stick with cross-platform animated opacity.
 */
interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius: br = radius.sm,
  style,
}: SkeletonProps) {
  const anim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 0.9,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0.4,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  return (
    <Animated.View
      style={[
        styles.block,
        { width, height, borderRadius: br, opacity: anim },
        style,
      ]}
    />
  );
}

/**
 * Matches PostCard's compact row: avatar + two stacked lines + thumb.
 */
export function PostCardSkeleton() {
  return (
    <View style={styles.cardRow}>
      <Skeleton width={32} height={32} borderRadius={16} />
      <View style={styles.cardTextCol}>
        <Skeleton width="75%" height={14} />
        <Skeleton width="40%" height={11} style={{ marginTop: 6 }} />
      </View>
      <Skeleton width={64} height={64} borderRadius={radius.md} />
    </View>
  );
}

/**
 * Matches user row in Discover.
 */
export function UserRowSkeleton() {
  return (
    <View style={styles.userRow}>
      <Skeleton width={44} height={44} borderRadius={22} />
      <View style={styles.cardTextCol}>
        <Skeleton width="50%" height={14} />
        <Skeleton width="30%" height={12} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

/**
 * Matches the profile header (avatar + name + bio + stats).
 */
export function ProfileHeaderSkeleton() {
  return (
    <View style={styles.profile}>
      <Skeleton width={96} height={96} borderRadius={48} />
      <Skeleton width={180} height={20} style={{ marginTop: spacing.md }} />
      <Skeleton width={120} height={14} style={{ marginTop: 6 }} />
      <Skeleton width="80%" height={12} style={{ marginTop: spacing.md }} />
      <Skeleton width="60%" height={12} style={{ marginTop: 4 }} />
      <View style={styles.statsRow}>
        <Skeleton width={60} height={30} borderRadius={radius.sm} />
        <Skeleton width={60} height={30} borderRadius={radius.sm} />
        <Skeleton width={60} height={30} borderRadius={radius.sm} />
      </View>
    </View>
  );
}

/**
 * Renders N PostCard skeletons — handy for feed/schedule ListEmptyComponent.
 */
export function PostListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <PostCardSkeleton key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.surface,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    opacity: 0.9,
  },
  cardTextCol: {
    flex: 1,
    minWidth: 0,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  profile: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
    paddingHorizontal: spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
});
