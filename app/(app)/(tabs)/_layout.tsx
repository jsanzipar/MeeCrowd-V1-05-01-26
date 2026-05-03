import { Tabs, useRouter } from 'expo-router';
import { Image, StyleSheet, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';

// Local asset — avoids network fetch on every render + works offline
const LOGO_ICON = require('@/assets/images/logo-w.png');

export default function TabLayout() {
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color }) => (
            <Image
              source={LOGO_ICON}
              style={[iconStyles.logo, { tintColor: color }]}
              resizeMode="contain"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Saved',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bookmark" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
      {/*
        Create-post launcher tab — last position so the "+" anchors the
        right side of the bar (where the floating button used to live).
        We never actually navigate to /(tabs)/create — the listener below
        intercepts the press and pushes to /(app)/post/create instead.
        The custom tabBarButton renders a coloured circle so the "+"
        visually stands out from the other tabs.
      */}
      <Tabs.Screen
        name="create"
        options={{
          title: 'Create',
          tabBarButton: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create new post"
              onPress={() => router.push('/(app)/post/create')}
              style={iconStyles.createButtonWrap}
            >
              <View style={iconStyles.createButton}>
                <Ionicons name="add" size={22} color={colors.white} />
              </View>
            </Pressable>
          ),
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.push('/(app)/post/create');
          },
        }}
      />
      {/* Hidden tabs — accessible via router.push but not in tab bar */}
      <Tabs.Screen
        name="notifications"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="discover"
        options={{ href: null }}
      />
    </Tabs>
  );
}

const iconStyles = StyleSheet.create({
  logo: {
    width: 26,
    height: 26,
  },
  createButtonWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
