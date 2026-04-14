import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '@/theme';
import type { FeedTab } from '@/types';

const tabs: { key: FeedTab; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'trending', label: 'Trending' },
];

interface FeedTabsProps {
  activeTab: FeedTab;
  onTabChange: (tab: FeedTab) => void;
}

export function FeedTabs({ activeTab, onTabChange }: FeedTabsProps) {
  return (
    <View style={styles.container}>
      {tabs.map(({ key, label }) => (
        <TouchableOpacity
          key={key}
          onPress={() => onTabChange(key)}
          style={[styles.tab, activeTab === key && styles.activeTab]}
        >
          <Text style={[styles.label, activeTab === key && styles.activeLabel]}>
            {label}
          </Text>
          {activeTab === key && <View style={styles.indicator} />}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    position: 'relative',
  },
  activeTab: {},
  label: {
    ...typography.bodyBold,
    color: colors.textMuted,
  },
  activeLabel: {
    color: colors.text,
  },
  indicator: {
    position: 'absolute',
    bottom: 0,
    height: 3,
    width: '60%',
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
  },
});
