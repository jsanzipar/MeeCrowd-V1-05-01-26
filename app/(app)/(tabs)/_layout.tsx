import { Tabs } from 'expo-router';
import { Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';

// Local asset — avoids network fetch on every render + works offline
const LOGO_ICON = require('@/assets/images/logo-w.png');

export default function TabLayout() {
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
});
