import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  FlatList,
  StyleSheet,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '@/theme';
import type { SortFilter, Platform } from '@/types';

const STORAGE_BASE = 'https://nfreggighhtvznvcofql.supabase.co/storage/v1/object/public/assets/logos';

const platformLogo: Record<Platform, string> = {
  youtube: `${STORAGE_BASE}/YouTubeLogo.png`,
  twitch: `${STORAGE_BASE}/TwitchLogo.png`,
  kick: `${STORAGE_BASE}/KickLogo.png`,
  instagram: `${STORAGE_BASE}/InstagramLogo.png`,
  tiktok: `${STORAGE_BASE}/TikTokLogo.png`,
  x: `${STORAGE_BASE}/XLogo.png`,
  facebook: `${STORAGE_BASE}/FacebookLogo.png`,
  linkedin: `${STORAGE_BASE}/LinkedInLogo.png`,
};

interface FilterOption {
  key: SortFilter;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  platformIcon?: Platform;
}

const FILTER_SECTIONS: { title: string; filters: FilterOption[] }[] = [
  {
    title: 'People',
    filters: [
      { key: 'following', label: 'Following', icon: 'people' },
      { key: 'streamers', label: 'Streamers', icon: 'videocam' },
      { key: 'broadcasters', label: 'Broadcasters', icon: 'tv' },
    ],
  },
  {
    title: 'Platforms',
    filters: [
      { key: 'youtube', label: 'YouTube', platformIcon: 'youtube' },
      { key: 'twitch', label: 'Twitch', platformIcon: 'twitch' },
      { key: 'kick', label: 'Kick', platformIcon: 'kick' },
      { key: 'instagram', label: 'Instagram', platformIcon: 'instagram' },
      { key: 'tiktok', label: 'TikTok', platformIcon: 'tiktok' },
      { key: 'x', label: 'X', platformIcon: 'x' },
      { key: 'facebook', label: 'Facebook', platformIcon: 'facebook' },
      { key: 'linkedin', label: 'LinkedIn', platformIcon: 'linkedin' },
    ],
  },
  {
    title: 'Categories',
    filters: [
      { key: 'gaming', label: 'Gaming', icon: 'game-controller' },
      { key: 'music', label: 'Music', icon: 'musical-notes' },
      { key: 'sports', label: 'Sports', icon: 'football' },
      { key: 'education', label: 'Education', icon: 'school' },
      { key: 'entertainment', label: 'Entertainment', icon: 'sparkles' },
    ],
  },
  {
    title: 'Location',
    filters: [
      { key: 'near-me', label: 'Near Me', icon: 'location' },
      { key: 'location', label: 'Choose Location', icon: 'globe-outline' },
    ],
  },
];

// ── Countries list ──
const COUNTRIES = [
  'United States', 'United Kingdom', 'Canada', 'Australia', 'Germany',
  'France', 'Spain', 'Italy', 'Brazil', 'Mexico', 'Argentina', 'Colombia',
  'Japan', 'South Korea', 'India', 'China', 'Indonesia', 'Philippines',
  'Thailand', 'Vietnam', 'Turkey', 'Saudi Arabia', 'UAE', 'Egypt',
  'Nigeria', 'South Africa', 'Kenya', 'Sweden', 'Norway', 'Denmark',
  'Netherlands', 'Belgium', 'Switzerland', 'Austria', 'Poland', 'Portugal',
  'Ireland', 'New Zealand', 'Singapore', 'Malaysia', 'Chile', 'Peru',
  'Israel', 'Russia', 'Ukraine', 'Romania', 'Czech Republic', 'Greece',
  'Taiwan', 'Pakistan',
];

interface SortFiltersProps {
  activeFilters: SortFilter[];
  selectedCountry: string | null;
  onToggle: (filter: SortFilter) => void;
  onClear: () => void;
  onChooseLocation: () => void;
}

export function SortFilters({
  activeFilters,
  selectedCountry,
  onToggle,
  onClear,
  onChooseLocation,
}: SortFiltersProps) {
  const hasFilters = activeFilters.length > 0;

  return (
    <View style={styles.panel}>
      {/* Clear all row */}
      {hasFilters && (
        <TouchableOpacity style={styles.clearRow} onPress={onClear}>
          <Ionicons name="close-circle-outline" size={14} color={colors.error} />
          <Text style={styles.clearText}>Clear all filters</Text>
        </TouchableOpacity>
      )}

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {FILTER_SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.optionsList}>
              {section.filters.map((f) => {
                const isActive = activeFilters.includes(f.key);
                const isLocationWithCountry = f.key === 'location' && selectedCountry;

                return (
                  <TouchableOpacity
                    key={f.key}
                    style={styles.optionRow}
                    onPress={() => {
                      if (f.key === 'location') {
                        onChooseLocation();
                      } else {
                        onToggle(f.key);
                      }
                    }}
                    activeOpacity={0.6}
                  >
                    <View style={styles.optionLeft}>
                      {f.platformIcon ? (
                        <Image
                          source={{ uri: platformLogo[f.platformIcon] }}
                          style={styles.platformIcon}
                          resizeMode="contain"
                        />
                      ) : f.icon ? (
                        <Ionicons
                          name={f.icon}
                          size={16}
                          color={isActive ? colors.primary : colors.textSecondary}
                        />
                      ) : null}
                      <Text style={[styles.optionLabel, isActive && styles.optionLabelActive]}>
                        {isLocationWithCountry ? selectedCountry : f.label}
                      </Text>
                    </View>
                    {isActive && (
                      <Ionicons name="checkmark" size={16} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/** Country picker modal */
interface CountryPickerProps {
  visible: boolean;
  selected: string | null;
  onSelect: (country: string | null) => void;
  onClose: () => void;
}

export function CountryPicker({ visible, selected, onSelect, onClose }: CountryPickerProps) {
  const [search, setSearch] = useState('');
  const filtered = search
    ? COUNTRIES.filter((c) => c.toLowerCase().includes(search.toLowerCase()))
    : COUNTRIES;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Choose Location</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={styles.modalSearchRow}>
            <Ionicons name="search" size={14} color={colors.textMuted} />
            <TextInput
              style={styles.countrySearchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search countries..."
              placeholderTextColor={colors.textMuted}
              autoCorrect={false}
            />
          </View>

          {/* Clear selection */}
          {selected && (
            <TouchableOpacity
              style={styles.modalClearRow}
              onPress={() => { onSelect(null); setSearch(''); }}
            >
              <Ionicons name="close-circle-outline" size={14} color={colors.error} />
              <Text style={styles.modalClearText}>Clear location</Text>
            </TouchableOpacity>
          )}

          {/* Countries list */}
          <FlatList
            data={filtered}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.countryRow}
                onPress={() => { onSelect(item); setSearch(''); }}
              >
                <Text style={[
                  styles.countryText,
                  selected === item && styles.countryTextActive,
                ]}>
                  {item}
                </Text>
                {selected === item && (
                  <Ionicons name="checkmark" size={16} color={colors.primary} />
                )}
              </TouchableOpacity>
            )}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </View>
    </Modal>
  );
}

/** Compact active-filter chips shown in the header bar */
export function ActiveFilterChips({
  filters,
  selectedCountry,
  onToggle,
  onClear,
}: {
  filters: SortFilter[];
  selectedCountry: string | null;
  onToggle: (f: SortFilter) => void;
  onClear: () => void;
}) {
  if (filters.length === 0) return null;

  const allOptions = FILTER_SECTIONS.flatMap((s) => s.filters);

  // Show at most 2 chips, then a "+N more"
  const displayFilters = filters.slice(0, 2);
  const overflow = filters.length - 2;

  return (
    <View style={styles.activeChipsRow}>
      {displayFilters.map((f) => {
        const opt = allOptions.find((o) => o.key === f);
        if (!opt) return null;
        const label = f === 'location' && selectedCountry ? selectedCountry : opt.label;
        return (
          <TouchableOpacity
            key={f}
            style={styles.activeChip}
            onPress={() => onToggle(f)}
          >
            {opt.platformIcon ? (
              <Image
                source={{ uri: platformLogo[opt.platformIcon] }}
                style={{ width: 10, height: 10 }}
                resizeMode="contain"
              />
            ) : null}
            <Text style={styles.activeChipText} numberOfLines={1}>
              {label}
            </Text>
            <Ionicons name="close" size={10} color={colors.textMuted} />
          </TouchableOpacity>
        );
      })}
      {overflow > 0 && (
        <Text style={styles.overflowText}>+{overflow}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    maxHeight: 380,
  },
  clearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  clearText: {
    fontSize: 12,
    color: colors.error,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  section: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  optionsList: {},
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  optionLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  optionLabelActive: {
    color: colors.text,
    fontWeight: '600',
  },
  platformIcon: {
    width: 16,
    height: 16,
  },

  // ── Country picker modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: spacing['2xl'],
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    ...typography.bodyBold,
    color: colors.text,
    fontSize: 16,
  },
  modalSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  countrySearchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    paddingVertical: 0,
    marginLeft: spacing.xs,
  },
  modalClearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  modalClearText: {
    fontSize: 12,
    color: colors.error,
  },
  countryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  countryText: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  countryTextActive: {
    color: colors.text,
    fontWeight: '600',
  },

  // ── Active filter chips in header ──
  activeChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    overflow: 'hidden',
  },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.primary,
    maxWidth: 100,
  },
  activeChipText: {
    fontSize: 10,
    color: colors.primaryLight,
    fontWeight: '600',
  },
  overflowText: {
    fontSize: 10,
    color: colors.primaryLight,
    fontWeight: '700',
  },
});
