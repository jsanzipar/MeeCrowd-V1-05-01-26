import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Dimensions,
  Pressable,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/authStore';
import { colors, spacing, typography } from '@/theme';

const LOGO = require('@/assets/images/logo-w.png');
const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Slide = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
};

// Three slides, each pitching one core promise. Voice is casual-direct —
// no marketing fluff, no exclamation marks. Think Arc / Linear onboarding.
const SLIDES: Slide[] = [
  {
    key: 'aggregate',
    icon: 'layers-outline',
    title: 'Every creator, one feed',
    body: 'Follow YouTube, Twitch, Kick, and Instagram creators without juggling apps.',
  },
  {
    key: 'save',
    icon: 'bookmark-outline',
    title: 'Save for later',
    body: 'Tap Save on any post to build a lineup of events and streams you actually want to catch.',
  },
  {
    key: 'safe',
    icon: 'shield-checkmark-outline',
    title: 'Your space, your rules',
    body: 'Report and block are one tap away. We take moderation seriously so you can focus on the fun.',
  },
];

export default function OnboardingScreen() {
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);
  const markOnboardingSeen = useAuthStore((s) => s.markOnboardingSeen);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const next = Math.round(x / SCREEN_WIDTH);
    if (next !== index) setIndex(next);
  }, [index]);

  const finish = useCallback(async () => {
    await markOnboardingSeen();
    router.replace('/(auth)/login');
  }, [markOnboardingSeen]);

  const onPrimaryPress = useCallback(() => {
    if (index < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: index + 1, animated: true });
      setIndex(index + 1);
    } else {
      finish();
    }
  }, [index, finish]);

  const isLast = index === SLIDES.length - 1;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Top bar: logo left, skip right */}
      <View style={styles.topBar}>
        <Image source={LOGO} style={styles.logo} resizeMode="contain" />
        <Pressable
          onPress={finish}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Skip onboarding"
        >
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(s) => s.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <View style={styles.slide}>
            <View style={styles.iconWrap}>
              <Ionicons name={item.icon} size={56} color={colors.primary} />
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        )}
      />

      {/* Dots */}
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === index && styles.dotActive]}
          />
        ))}
      </View>

      {/* CTA */}
      <View style={styles.ctaWrap}>
        <Button
          title={isLast ? 'Get Started' : 'Next'}
          onPress={onPrimaryPress}
          size="lg"
        />
        {!isLast && (
          <Pressable onPress={finish} style={styles.secondaryRow} hitSlop={8}>
            <Text style={styles.secondaryText}>Already have an account?</Text>
            <Text style={styles.secondaryLink}> Sign in</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  logo: {
    width: 120,
    height: 36,
  },
  skip: {
    ...typography.bodyBold,
    color: colors.textSecondary,
  },
  slide: {
    width: SCREEN_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  iconWrap: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing['2xl'],
  },
  title: {
    ...typography.h1,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 320,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.xs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: {
    width: 24,
    backgroundColor: colors.primary,
  },
  ctaWrap: {
    paddingHorizontal: spacing['2xl'],
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  secondaryRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  secondaryLink: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
});
