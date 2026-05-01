import Toast from 'react-native-toast-message';
import { Platform } from 'react-native';

/**
 * Tiny wrapper over react-native-toast-message so call sites don't have to
 * repeat option objects. All toasts live on a single <Toast /> mount at the
 * root of the app tree (see app/_layout.tsx).
 *
 * On web the library is a bit noisy with strict-mode warnings; we still use
 * it instead of window.alert because window.alert blocks rendering and
 * swallows user interaction in a way that's worse than a banner.
 */

type Opts = {
  /** Headline. Keep it short — 1 line. */
  title?: string;
  /** Secondary line. */
  message?: string;
};

const DURATION = Platform.OS === 'web' ? 4000 : 2800;

export const toast = {
  success(opts: Opts | string) {
    const o = typeof opts === 'string' ? { title: opts } : opts;
    Toast.show({
      type: 'success',
      text1: o.title,
      text2: o.message,
      visibilityTime: DURATION,
      position: 'top',
      topOffset: 50,
    });
  },

  error(opts: Opts | string) {
    const o = typeof opts === 'string' ? { title: opts } : opts;
    Toast.show({
      type: 'error',
      text1: o.title ?? 'Something went wrong',
      text2: o.message,
      visibilityTime: DURATION,
      position: 'top',
      topOffset: 50,
    });
  },

  info(opts: Opts | string) {
    const o = typeof opts === 'string' ? { title: opts } : opts;
    Toast.show({
      type: 'info',
      text1: o.title,
      text2: o.message,
      visibilityTime: DURATION,
      position: 'top',
      topOffset: 50,
    });
  },

  /** For catch blocks — pulls .message off the error if present. */
  fromError(err: unknown, fallback = 'Something went wrong') {
    const msg =
      err && typeof err === 'object' && 'message' in err
        ? String((err as any).message)
        : fallback;
    Toast.show({
      type: 'error',
      text1: fallback,
      text2: msg !== fallback ? msg : undefined,
      visibilityTime: DURATION,
      position: 'top',
      topOffset: 50,
    });
  },

  hide() {
    Toast.hide();
  },
};
