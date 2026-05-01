import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Haptic helpers. expo-haptics is a no-op on web (the module loads but the
 * native methods reject), so we short-circuit at the call site to avoid log
 * noise. All helpers are fire-and-forget — failures are swallowed because
 * haptics should never block UX.
 */

const enabled = Platform.OS === 'ios' || Platform.OS === 'android';

function safe(fn: () => Promise<unknown>) {
  if (!enabled) return;
  fn().catch(() => {
    // Haptics can fail on devices with vibration disabled system-wide —
    // non-fatal, don't leak to the console.
  });
}

export const haptics = {
  /** Light tap — use for toggles like/bookmark/follow. */
  light() {
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },
  /** Medium — use for moderately important actions (button press). */
  medium() {
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  },
  /** Heavy — use sparingly for big confirmations. */
  heavy() {
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
  },
  /** Success — use after a successful submit / post / save. */
  success() {
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  },
  /** Warning — use for confirmation prompts or near-misses. */
  warning() {
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
  },
  /** Error — use when an action failed. */
  error() {
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
  },
  /** Selection change — subtle tick used for picker-like UI. */
  selection() {
    safe(() => Haptics.selectionAsync());
  },
};
