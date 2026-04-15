import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '@/theme';

export type ProfileTab = 'events' | 'personal' | 'vip' | 'achievements';

const TAB_LABELS: Record<ProfileTab, string> = {
  events: 'Events',
  personal: 'Personal',
  vip: 'VIP Crowd',
  achievements: 'Achievements',
};

interface ProfileTabsProps {
  active: ProfileTab;
  onTabChange: (tab: ProfileTab) => void;
  isOwnProfile: boolean;
}

export function ProfileTabs({ active, onTabChange, isOwnProfile }: ProfileTabsProps) {
  const tabs: ProfileTab[] = isOwnProfile
    ? ['events', 'personal', 'vip', 'achievements']
    : ['events', 'vip', 'achievements'];

  return (
    <View style={styles.container}>
      {tabs.map((t) => (
        <TouchableOpacity
          key={t}
          style={[styles.tab, active === t && styles.activeTab]}
          onPress={() => onTabChange(t)}
        >
          <Text style={[styles.tabText, active === t && styles.activeTabText]}>
            {TAB_LABELS[t]}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    position: 'relative',
  },
  activeTab: {
    borderBottomWidth: 3,
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  activeTabText: {
    color: colors.text,
  },
});
