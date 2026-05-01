import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { colors } from '@/theme';

function AuthGate() {
  const { session, isReady, hasSeenOnboarding } = useAuthStore();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (!isReady) return;

    const inAuth = segments[0] === '(auth)';

    if (!session && !inAuth) {
      // First launch: show the product tour before the login form.
      // After they've seen it once, AsyncStorage remembers and we skip
      // straight to login on every subsequent launch.
      router.replace(hasSeenOnboarding ? '/(auth)/login' : '/(auth)/onboarding');
    } else if (session && inAuth) {
      router.replace('/(app)/(tabs)');
    }
  }, [session, isReady, segments, hasSeenOnboarding]);

  if (!isReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return <Slot />;
}

export default function RootLayout() {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <View style={styles.root}>
        <StatusBar style="light" />
        <AuthGate />
        {/* Toast must sit at the end so it stacks above every screen.
            It's safe above Slot because it listens on a global event bus —
            no context coupling to the router. */}
        <Toast />
      </View>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
