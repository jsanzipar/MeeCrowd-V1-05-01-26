import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  moderationService,
  REPORT_REASON_LABELS,
  type ReportReason,
  type ReportTargetType,
} from '@/services/moderation';
import { colors, spacing, typography, radius } from '@/theme';

interface ReportSheetProps {
  visible: boolean;
  onClose: () => void;
  target: {
    target_type: ReportTargetType;
    target_id: string;
  };
}

const REASONS: ReportReason[] = [
  'spam',
  'harassment',
  'hate_speech',
  'violence',
  'self_harm',
  'sexual_content',
  'minor_safety',
  'intellectual_property',
  'illegal_activity',
  'other',
];

export function ReportSheet({ visible, onClose, target }: ReportSheetProps) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setReason(null);
    setDetails('');
    setSubmitting(false);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!reason) {
      Alert.alert('Choose a reason', 'Please tell us what the issue is.');
      return;
    }
    setSubmitting(true);
    try {
      await moderationService.reportContent({
        target_type: target.target_type,
        target_id: target.target_id,
        reason,
        details: details.trim() || undefined,
      });
      reset();
      onClose();
      Alert.alert(
        'Report sent',
        'Thanks for letting us know. Our team will review this within 24 hours.'
      );
    } catch (err: any) {
      setSubmitting(false);
      Alert.alert('Could not send report', err.message ?? 'Please try again.');
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropDismiss} onPress={handleClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}
        >
          <View style={styles.sheet}>
            <View style={styles.grabberWrap}>
              <View style={styles.grabber} />
            </View>

            <View style={styles.header}>
              <Text style={styles.title}>Report</Text>
              <Pressable onPress={handleClose} hitSlop={10} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <Text style={styles.subtitle}>
              Why are you reporting this{' '}
              {target.target_type === 'post'
                ? 'post'
                : target.target_type === 'comment'
                ? 'comment'
                : 'profile'}
              ?
            </Text>

            <ScrollView
              style={styles.reasonsScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {REASONS.map((r) => {
                const active = reason === r;
                return (
                  <Pressable
                    key={r}
                    onPress={() => setReason(r)}
                    style={[styles.reasonRow, active && styles.reasonRowActive]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                  >
                    <View
                      style={[styles.radio, active && styles.radioActive]}
                    >
                      {active && <View style={styles.radioDot} />}
                    </View>
                    <Text style={styles.reasonLabel}>
                      {REPORT_REASON_LABELS[r]}
                    </Text>
                  </Pressable>
                );
              })}

              <Text style={styles.detailsLabel}>Additional details (optional)</Text>
              <TextInput
                style={styles.detailsInput}
                placeholder="Share any context that helps us review"
                placeholderTextColor={colors.textMuted}
                value={details}
                onChangeText={setDetails}
                multiline
                maxLength={500}
                textAlignVertical="top"
              />
              <Text style={styles.charCount}>{details.length}/500</Text>
            </ScrollView>

            <View style={styles.footer}>
              <Pressable
                onPress={handleClose}
                style={[styles.footerBtn, styles.footerCancel]}
                disabled={submitting}
              >
                <Text style={styles.footerCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSubmit}
                style={[
                  styles.footerBtn,
                  styles.footerSubmit,
                  (!reason || submitting) && styles.footerSubmitDisabled,
                ]}
                disabled={!reason || submitting}
              >
                <Text style={styles.footerSubmitText}>
                  {submitting ? 'Sending…' : 'Send Report'}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  backdropDismiss: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetWrap: {
    maxHeight: '90%',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['2xl'],
  },
  grabberWrap: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.h2,
    color: colors.text,
  },
  closeBtn: {
    padding: 4,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  reasonsScroll: {
    maxHeight: 380,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
    backgroundColor: colors.background,
  },
  reasonRowActive: {
    backgroundColor: colors.primary + '18',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    marginRight: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    borderColor: colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  reasonLabel: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
  detailsLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  detailsInput: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 80,
    color: colors.text,
    ...typography.body,
    borderWidth: 1,
    borderColor: colors.border,
  },
  charCount: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: 4,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  footerBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerCancel: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  footerCancelText: {
    ...typography.button,
    color: colors.textSecondary,
  },
  footerSubmit: {
    backgroundColor: colors.primary,
  },
  footerSubmitDisabled: {
    opacity: 0.5,
  },
  footerSubmitText: {
    ...typography.button,
    color: colors.white,
  },
});
