import { Tabs } from 'expo-router';
import { Image, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';

const LOGO_ICON_URL =
  'https://nfreggighhtvznvcofql.supabase.co/storage/v1/object/public/assets/logos/MeeCrowdLogoW.png';

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
              source={{ uri: LOGO_ICON_URL }}
              style={[iconStyles.logo, { tintColor: color }]}
              resizeMode="contain"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Schedule',
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
