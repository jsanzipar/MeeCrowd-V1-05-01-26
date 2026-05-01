import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform as RNPlatform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors, spacing, radius, typography } from '@/theme';
import { postsService } from '@/services/posts';
import { storageService } from '@/services/storage';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import { toast } from '@/lib/toast';
import { haptics } from '@/lib/haptics';

// Only MeeCrowd is wired up at launch. Other platforms will be added once
// cross-posting is live; showing unused tiles would trigger App Store review
// rejection under "misleading features."

const CATEGORIES = ['Gaming', 'Music', 'Sports', 'Education', 'Entertainment', 'Art', 'Tech'] as const;
type Category = typeof CATEGORIES[number];

interface LocalMedia {
  uri: string;
  mime?: string;
  kind: 'image' | 'video';
}

export default function CreatePostScreen() {
  // ── Form state ──────────────────────────────────────────────
  const [media, setMedia] = useState<LocalMedia[]>([]);
  const [caption, setCaption] = useState('');
  const [schedule, setSchedule] = useState<Date | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [location, setLocation] = useState<string>('');

  // ── UI state ────────────────────────────────────────────────
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const charCount = caption.length;
  const canSubmit = (caption.trim().length > 0 || media.length > 0) && !submitting;

  // ── Handlers ────────────────────────────────────────────────
  const pickMedia = async () => {
    if (media.length >= 10) {
      toast.info({ title: 'Media limit', message: 'You can add up to 10 items per post.' });
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.error({
        title: 'Permission needed',
        message: 'Allow photo library access in settings to add media.',
      });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      selectionLimit: 10 - media.length,
      quality: 0.9,
    });
    if (result.canceled) return;
    const picked: LocalMedia[] = result.assets.map((a) => ({
      uri: a.uri,
      mime: a.mimeType,
      kind: a.type === 'video' ? 'video' : 'image',
    }));
    setMedia((prev) => [...prev, ...picked].slice(0, 10));
  };

  const removeMedia = (index: number) => {
    setMedia((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSchedulePress = () => {
    setShowSchedulePicker(true);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    haptics.medium();
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Upload media in parallel (if any)
      let mediaUrls: string[] | null = null;
      if (media.length > 0) {
        const uploads = await Promise.all(
          media.map((m) => storageService.uploadPostMedia(user.id, m.uri, m.mime)),
        );
        mediaUrls = uploads.map((u) => u.url);
      }

      // Build title from caption (first line, up to 80 chars)
      const firstLine = caption.trim().split('\n')[0];
      const title = firstLine.slice(0, 80) || 'New post';
      const body = caption.trim().length > title.length ? caption.trim() : null;

      await postsService.createPost({
        title,
        body,
        platform: 'meecrowd',
        content_type: schedule ? 'scheduled' : 'post',
        media_urls: mediaUrls,
        thumbnail_url: mediaUrls?.[0] ?? null,
        starts_at: schedule ? schedule.toISOString() : null,
      });

      // Invalidate feed queries so the new post appears
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['user-posts'] });

      haptics.success();
      toast.success({ title: 'Shared to MeeCrowd' });
      router.back();
    } catch (e: any) {
      haptics.error();
      toast.fromError(e, 'Could not publish');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Derived copy ────────────────────────────────────────────
  const scheduleLabel = useMemo(() => {
    if (!schedule) return null;
    const now = new Date();
    const same = schedule.toDateString() === now.toDateString();
    const tom = new Date(now); tom.setDate(tom.getDate() + 1);
    const isTom = schedule.toDateString() === tom.toDateString();
    const time = schedule.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (same) return `Today · ${time}`;
    if (isTom) return `Tomorrow · ${time}`;
    return `${schedule.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${time}`;
  }, [schedule]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* KeyboardAvoidingView wraps the full body so the sticky Share bar
          lifts above the keyboard on iOS. On Android the system already
          resizes the root view, so `undefined` is correct.  */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={RNPlatform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={RNPlatform.OS === 'ios' ? 0 : 0}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={10}
            style={styles.headerBtn}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New post</Text>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!canSubmit}
            hitSlop={10}
            style={styles.headerBtn}
            accessibilityRole="button"
            accessibilityLabel="Share post"
          >
            {submitting ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[styles.headerAction, !canSubmit && styles.headerActionDisabled]}>
                Share
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* ── Media strip ── */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.mediaStrip}
          >
            {media.map((m, i) => (
              <View key={i} style={styles.mediaItem}>
                <Image source={{ uri: m.uri }} style={styles.mediaImg} resizeMode="cover" />
                {i === 0 && (
                  <View style={styles.coverBadge}>
                    <Text style={styles.coverBadgeText}>COVER</Text>
                  </View>
                )}
                {m.kind === 'video' && (
                  <View style={styles.videoBadge}>
                    <Ionicons name="play" size={12} color={colors.white} />
                  </View>
                )}
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => removeMedia(i)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Remove media"
                >
                  <Ionicons name="close" size={14} color={colors.white} />
                </TouchableOpacity>
              </View>
            ))}
            {media.length < 10 && (
              <TouchableOpacity
                style={styles.addMedia}
                onPress={pickMedia}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={media.length === 0 ? 'Add photo or video' : 'Add more media'}
              >
                <Ionicons name="add" size={28} color={colors.textMuted} />
                <Text style={styles.addMediaText}>{media.length === 0 ? 'Add photo / video' : 'Add more'}</Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          {/* ── Caption ── */}
          <View style={styles.captionWrap}>
            <TextInput
              style={styles.caption}
              placeholder="What's happening? Tell the crowd what to expect…"
              placeholderTextColor={colors.textMuted}
              value={caption}
              onChangeText={setCaption}
              multiline
              textAlignVertical="top"
              accessibilityLabel="Post caption"
            />
            <View style={styles.captionMeta}>
              <Text style={styles.captionMetaText}>Publishing to MeeCrowd</Text>
              <Text style={styles.captionMetaText}>{charCount}</Text>
            </View>
          </View>

          {/* ── Meta chips ── */}
          <View style={styles.chipRow}>
            <Chip
              icon="calendar-outline"
              label={scheduleLabel ?? 'Schedule'}
              active={!!schedule}
              onPress={handleSchedulePress}
              onClear={schedule ? () => setSchedule(null) : undefined}
            />
            <Chip
              icon="pricetag-outline"
              label={category ?? 'Category'}
              active={!!category}
              onPress={() => setShowCategoryPicker(true)}
              onClear={category ? () => setCategory(null) : undefined}
            />
            <Chip
              icon="location-outline"
              label={location || 'Location'}
              active={!!location}
              onPress={() => setShowLocationPicker(true)}
              onClear={location ? () => setLocation('') : undefined}
            />
          </View>

          <View style={{ height: spacing['4xl'] }} />
        </ScrollView>

        {/* ── Sticky CTA ── */}
        <View style={styles.ctaBar}>
          <TouchableOpacity
            style={[styles.cta, !canSubmit && styles.ctaDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Share to MeeCrowd"
          >
            {submitting ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.ctaText}>Share to MeeCrowd</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* ── Schedule picker modal ── */}
      {showSchedulePicker && (
        <SchedulePicker
          value={schedule}
          onChange={(d) => setSchedule(d)}
          onClose={() => setShowSchedulePicker(false)}
        />
      )}

      {/* ── Category picker modal ── */}
      {showCategoryPicker && (
        <PickerSheet title="Category" onClose={() => setShowCategoryPicker(false)}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c}
              style={styles.pickerRow}
              onPress={() => { setCategory(c); setShowCategoryPicker(false); }}
            >
              <Text style={styles.pickerRowText}>{c}</Text>
              {category === c && <Ionicons name="checkmark" size={18} color={colors.primary} />}
            </TouchableOpacity>
          ))}
        </PickerSheet>
      )}

      {/* ── Location picker modal ── */}
      {showLocationPicker && (
        <PickerSheet title="Location" onClose={() => setShowLocationPicker(false)}>
          <TextInput
            autoFocus
            placeholder="e.g. Stubb's, Austin TX"
            placeholderTextColor={colors.textMuted}
            value={location}
            onChangeText={setLocation}
            style={styles.locationInput}
            onSubmitEditing={() => setShowLocationPicker(false)}
            returnKeyType="done"
          />
          <TouchableOpacity
            style={styles.locationDone}
            onPress={() => setShowLocationPicker(false)}
          >
            <Text style={styles.locationDoneText}>Done</Text>
          </TouchableOpacity>
        </PickerSheet>
      )}
    </SafeAreaView>
  );
}

// ── Sub-components ───────────────────────────────────────────

function Chip({
  icon, label, active, onPress, onClear,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  onPress?: () => void;
  onClear?: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
    >
      <Ionicons
        name={icon}
        size={14}
        color={active ? colors.white : colors.textSecondary}
      />
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
      {active && onClear && (
        <Pressable
          onPress={onClear}
          hitSlop={6}
          style={styles.chipClear}
          accessibilityRole="button"
          accessibilityLabel={`Clear ${label}`}
        >
          <Ionicons name="close" size={12} color={colors.white} />
        </Pressable>
      )}
    </TouchableOpacity>
  );
}

function SchedulePicker({
  value, onChange, onClose,
}: { value: Date | null; onChange: (d: Date | null) => void; onClose: () => void }) {
  const [temp, setTemp] = useState<Date>(value ?? new Date(Date.now() + 3600_000));
  // Android's DateTimePicker only supports `date` OR `time` per instance, not
  // both at once (that's iOS-only). We render two pickers stacked so Android
  // users can still set a full datetime in a single sheet.
  const [androidStep, setAndroidStep] = useState<'date' | 'time'>('date');

  const isIOS = RNPlatform.OS === 'ios';
  const isAndroid = RNPlatform.OS === 'android';

  return (
    <PickerSheet title="Schedule" onClose={onClose}>
      {RNPlatform.OS === 'web' ? (
        <WebDateTimeInput value={temp} onChange={setTemp} />
      ) : isIOS ? (
        <View style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
          <DateTimePicker
            value={temp}
            mode="datetime"
            display="spinner"
            minimumDate={new Date()}
            onChange={(_, d) => { if (d) setTemp(d); }}
            textColor={colors.text}
            themeVariant="dark"
          />
        </View>
      ) : (
        // Android: stepped date → time with a summary header showing
        // the in-progress selection. Picker renders as a native modal.
        <View style={{ paddingVertical: spacing.sm }}>
          <Text style={styles.androidSummary}>
            {temp.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
            {'  ·  '}
            {temp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </Text>
          <View style={styles.androidStepButtons}>
            <TouchableOpacity
              style={[styles.androidStepBtn, androidStep === 'date' && styles.androidStepBtnActive]}
              onPress={() => setAndroidStep('date')}
            >
              <Ionicons
                name="calendar-outline"
                size={16}
                color={androidStep === 'date' ? colors.white : colors.textSecondary}
              />
              <Text style={[
                styles.androidStepText,
                androidStep === 'date' && styles.androidStepTextActive,
              ]}>Pick date</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.androidStepBtn, androidStep === 'time' && styles.androidStepBtnActive]}
              onPress={() => setAndroidStep('time')}
            >
              <Ionicons
                name="time-outline"
                size={16}
                color={androidStep === 'time' ? colors.white : colors.textSecondary}
              />
              <Text style={[
                styles.androidStepText,
                androidStep === 'time' && styles.androidStepTextActive,
              ]}>Pick time</Text>
            </TouchableOpacity>
          </View>
          {/* The native Android picker is modal; we remount it on step change
              so tapping either button re-opens it. The spread+key trick forces
              a fresh mount. */}
          <DateTimePicker
            key={androidStep}
            value={temp}
            mode={androidStep}
            display="default"
            minimumDate={androidStep === 'date' ? new Date() : undefined}
            onChange={(event, d) => {
              // Android fires event.type === 'dismissed' when user cancels
              if (event.type === 'set' && d) {
                setTemp(d);
                if (androidStep === 'date') setAndroidStep('time');
              }
            }}
          />
        </View>
      )}

      {/* Suppress "unused variable" linting on isAndroid/isIOS */}
      {(isIOS || isAndroid) && null}

      <TouchableOpacity
        style={styles.locationDone}
        onPress={() => { onChange(temp); onClose(); }}
      >
        <Text style={styles.locationDoneText}>Set time</Text>
      </TouchableOpacity>

      {value && (
        <TouchableOpacity
          style={styles.scheduleClear}
          onPress={() => { onChange(null); onClose(); }}
        >
          <Text style={styles.scheduleClearText}>Clear schedule</Text>
        </TouchableOpacity>
      )}
    </PickerSheet>
  );
}

function WebDateTimeInput({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  // React Native Web doesn't render <input type="datetime-local"> via TextInput.
  // Use React.createElement to emit a raw HTML input.
  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
  return React.createElement('input' as any, {
    type: 'datetime-local',
    value: iso,
    min: (() => { const n = new Date(); return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}T${pad(n.getHours())}:${pad(n.getMinutes())}`; })(),
    onChange: (e: any) => { const d = new Date(e.target.value); if (!isNaN(d.getTime())) onChange(d); },
    style: {
      width: '100%',
      padding: 14,
      marginTop: 12,
      backgroundColor: colors.background,
      color: colors.text,
      border: `1px solid ${colors.border}`,
      borderRadius: 12,
      fontSize: 16,
      fontFamily: 'inherit',
      colorScheme: 'dark',
      outline: 'none',
    },
  });
}

function PickerSheet({
  title, children, onClose,
}: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <Pressable style={styles.sheetScrim} onPress={onClose}>
      <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Close ${title.toLowerCase()} picker`}
          >
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        {children}
      </Pressable>
    </Pressable>
  );
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBtn: {
    minWidth: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: '600' },
  headerAction: { color: colors.primary, fontSize: 15, fontWeight: '600', textAlign: 'right' },
  headerActionDisabled: { color: colors.textMuted },

  body: { flex: 1 },

  // ── Media strip ──
  mediaStrip: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  mediaItem: {
    width: 130,
    height: 170,
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
    marginRight: spacing.sm,
    backgroundColor: colors.card,
  },
  mediaImg: { width: '100%', height: '100%' },
  coverBadge: {
    position: 'absolute',
    top: 8, left: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  coverBadgeText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  videoBadge: {
    position: 'absolute',
    right: 8, bottom: 8,
    width: 22, height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtn: {
    position: 'absolute',
    top: 6, right: 6,
    width: 22, height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMedia: {
    width: 130, height: 170,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginRight: spacing.sm,
  },
  addMediaText: { color: colors.textMuted, fontSize: 12, fontWeight: '500', paddingHorizontal: 10, textAlign: 'center' },

  // ── Caption ──
  captionWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  caption: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    minHeight: 80,
    maxHeight: 200,
    paddingVertical: spacing.sm,
    ...(RNPlatform.OS === 'web' ? { outlineWidth: 0 as any } : null),
  },
  captionMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  captionMetaText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },

  // ── Chip row ──
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '500' },
  chipTextActive: { color: colors.white, fontWeight: '600' },
  chipClear: {
    marginLeft: 2,
    width: 16, height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── CTA ──
  ctaBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  cta: {
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  ctaDisabled: {
    backgroundColor: colors.border,
    shadowOpacity: 0,
  },
  ctaText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.01,
  },

  // ── Sheets ──
  sheetScrim: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: spacing.sm,
    paddingBottom: spacing['2xl'],
    paddingHorizontal: spacing.lg,
    maxHeight: '70%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40, height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  sheetTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerRowText: { color: colors.text, fontSize: 15, fontWeight: '500' },

  locationInput: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    marginTop: spacing.sm,
    ...(RNPlatform.OS === 'web' ? { outlineWidth: 0 as any } : null),
  },
  locationDone: {
    marginTop: spacing.md,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationDoneText: { color: colors.white, fontSize: 14, fontWeight: '700' },
  scheduleClear: {
    marginTop: spacing.sm,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleClearText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },

  // ── Android datetime stepper ──
  androidSummary: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  androidStepButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  androidStepBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  androidStepBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  androidStepText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  androidStepTextActive: {
    color: colors.white,
  },
});
