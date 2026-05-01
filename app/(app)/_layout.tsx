import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="post/[id]"
        options={{
          headerShown: true,
          headerTitle: 'Post',
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="user/[id]"
        options={{
          headerShown: true,
          headerTitle: 'Profile',
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="settings/index"
        options={{
          headerShown: true,
          headerTitle: 'Settings',
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="settings/edit-profile"
        options={{
          headerShown: true,
          headerTitle: 'Edit Profile',
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="settings/platforms"
        options={{
          headerShown: true,
          headerTitle: 'Platforms',
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="settings/notifications"
        options={{
          headerShown: true,
          headerTitle: 'Alerts',
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="settings/blocked"
        options={{
          headerShown: true,
          headerTitle: 'Blocked Users',
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="settings/delete-account"
        options={{
          headerShown: true,
          headerTitle: 'Delete Account',
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="aggregation/index"
        options={{
          headerShown: true,
          headerTitle: 'Aggregated Channels',
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="aggregation/channel/[id]"
        options={{
          headerShown: true,
          headerTitle: 'Channel',
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="aggregation/content/[id]"
        options={{
          headerShown: true,
          headerTitle: 'Content',
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="external/[id]"
        options={{
          headerShown: true,
          headerTitle: 'Channel',
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          animation: 'slide_from_right',
        }}
      />
    </Stack>
  );
}
