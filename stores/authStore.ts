import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import type { User } from '@/types';
import { authService } from '@/services/auth';
import { usersService } from '@/services/users';

const ONBOARDING_KEY = '@meecrowd:onboarding-seen';

interface AuthState {
  session: Session | null;
  profile: User | null;
  isLoading: boolean;
  isReady: boolean;
  hasSeenOnboarding: boolean;

  initialize: () => Promise<void>;
  setSession: (session: Session | null) => void;
  loadProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    username: string,
    opts: { date_of_birth: string; terms_accepted: boolean }
  ) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  markOnboardingSeen: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  isLoading: false,
  isReady: false,
  hasSeenOnboarding: false,

  initialize: async () => {
    try {
      // Fetch session + onboarding flag in parallel for faster boot
      const [session, onboardingSeen] = await Promise.all([
        authService.getSession(),
        AsyncStorage.getItem(ONBOARDING_KEY).catch(() => null),
      ]);
      // If there's already a session, this isn't a first-launch anymore —
      // the user either signed up before onboarding existed, or has used
      // the app before. Mark onboarding seen so that signing out doesn't
      // route them through the tour.
      const hasSeenOnboarding = onboardingSeen === 'true' || !!session;
      set({
        session,
        hasSeenOnboarding,
        isReady: true,
      });
      if (session && onboardingSeen !== 'true') {
        AsyncStorage.setItem(ONBOARDING_KEY, 'true').catch(() => {});
      }
      if (session?.user) {
        await get().loadProfile();
      }
    } catch {
      set({ isReady: true });
    }

    authService.onAuthStateChange((_event, session) => {
      set({ session });
      if (session?.user) {
        get().loadProfile();
      } else {
        set({ profile: null });
      }
    });
  },

  setSession: (session) => set({ session }),

  loadProfile: async () => {
    const { session } = get();
    if (!session?.user) return;
    try {
      const profile = await usersService.getProfile(session.user.id);
      set({ profile });
    } catch {
      // Profile might not exist yet (new user)
    }
  },

  signIn: async (email, password) => {
    set({ isLoading: true });
    try {
      const { session } = await authService.signIn(email, password);
      // Successful sign-in means this isn't a first-time user — skip
      // onboarding on any future sign-outs.
      set({ session, hasSeenOnboarding: true });
      AsyncStorage.setItem(ONBOARDING_KEY, 'true').catch(() => {});
      if (session?.user) {
        await get().loadProfile();
      }
    } finally {
      set({ isLoading: false });
    }
  },

  signUp: async (email, password, username, opts) => {
    set({ isLoading: true });
    try {
      await authService.signUp(email, password, username, opts);
    } finally {
      set({ isLoading: false });
    }
  },

  signOut: async () => {
    // Clear local state FIRST so AuthGate redirects to login immediately.
    // If we awaited authService.signOut() first and it threw (stale token,
    // no network, expired refresh), the user would be stuck inside the app
    // with no feedback. The server-side token will expire on its own even
    // if the remote call doesn't land.
    set({ session: null, profile: null });
    try {
      await authService.signOut();
    } catch (err) {
      console.warn('[signOut] remote sign-out failed (ignored):', err);
    }
  },

  deleteAccount: async () => {
    set({ isLoading: true });
    try {
      await authService.deleteAccount();
      set({ session: null, profile: null });
    } finally {
      set({ isLoading: false });
    }
  },

  markOnboardingSeen: async () => {
    // Persist before updating state so a crash mid-transition doesn't
    // force the user through the flow again next launch.
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    } catch {
      // Storage failure is non-fatal — worst case user sees onboarding
      // one more time. Don't block the nav.
    }
    set({ hasSeenOnboarding: true });
  },
}));
