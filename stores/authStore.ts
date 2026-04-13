import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { User } from '@/types';
import { authService } from '@/services/auth';
import { usersService } from '@/services/users';

interface AuthState {
  session: Session | null;
  profile: User | null;
  isLoading: boolean;
  isReady: boolean;

  initialize: () => Promise<void>;
  setSession: (session: Session | null) => void;
  loadProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, username: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  isLoading: false,
  isReady: false,

  initialize: async () => {
    try {
      const session = await authService.getSession();
      set({ session, isReady: true });
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
      set({ session });
      if (session?.user) {
        await get().loadProfile();
      }
    } finally {
      set({ isLoading: false });
    }
  },

  signUp: async (email, password, username) => {
    set({ isLoading: true });
    try {
      await authService.signUp(email, password, username);
    } finally {
      set({ isLoading: false });
    }
  },

  signOut: async () => {
    await authService.signOut();
    set({ session: null, profile: null });
  },
}));
