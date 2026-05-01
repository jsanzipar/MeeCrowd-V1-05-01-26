import React, { useState, useEffect } from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { colors } from '@/theme';

interface AvatarProps {
  uri: string | null;
  name?: string;
  size?: number;
}

/**
 * Always-renders avatar: falls back to coloured initials tile when no URI
 * is provided OR when the remote image fails to load (404, CORS, expired
 * signed URL, etc.). The fallback swap is silent — no loading spinner
 * because a missing avatar is a non-event for the user.
 */
export function Avatar({ uri, name, size = 40 }: AvatarProps) {
  const [errored, setErrored] = useState(false);

  // Reset error state if parent swaps to a new URI (e.g. user updates avatar).
  useEffect(() => {
    setErrored(false);
  }, [uri]);

  const initials = name
    ? name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  if (uri && !errored) {
    return (
      <Image
        source={{ uri }}
        style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
        onError={() => setErrored(true)}
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.initials, { fontSize: size * 0.4 }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: colors.surface,
  },
  fallback: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: colors.white,
    fontWeight: '700',
  },
});
