import React, { useState, useEffect } from 'react';
import { View, Image, StyleSheet, ImageStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';

interface FallbackImageProps {
  uri: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  /** Icon shown in the fallback tile. Defaults to 'image-outline'. */
  fallbackIcon?: keyof typeof Ionicons.glyphMap;
  /** Icon size. Should be proportional to the image container. */
  fallbackIconSize?: number;
}

/**
 * Image that transparently falls back to a neutral tile (with a subtle icon)
 * if the remote image can't load. Prevents the broken-image Ionicon that
 * react-native-web shows by default, and preserves layout dimensions so
 * cards don't reflow mid-scroll.
 */
export function FallbackImage({
  uri,
  style,
  resizeMode = 'cover',
  fallbackIcon = 'image-outline',
  fallbackIconSize = 20,
}: FallbackImageProps) {
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setErrored(false);
  }, [uri]);

  if (!uri || errored) {
    return (
      <View style={[styles.fallback, style]}>
        <Ionicons
          name={fallbackIcon}
          size={fallbackIconSize}
          color={colors.textMuted}
        />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={style}
      resizeMode={resizeMode}
      onError={() => setErrored(true)}
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
