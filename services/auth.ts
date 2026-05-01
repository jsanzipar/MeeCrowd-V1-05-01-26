import { Linking } from 'react-native';
import { supabase } from '@/lib/supabase';

// Current terms/privacy version. Bump whenever the legal docs change
// so re-acceptance can be enforced if needed.
export const CURRENT_TERMS_VERSION = '1.0';

export const authService = {
  async signUp(
    email: string,
    password: string,
    username: string,
    opts: {
      date_of_birth: string; // ISO YYYY-MM-DD
      terms_accepted: boolean;
    }
  ) {
    if (!opts.terms_accepted) {
      throw new Error('You must accept the Terms of Service and Privacy Policy to continue.');
    }
    // COPPA / Apple 5.1.4 — require 13+
    const dob = new Date(opts.date_of_birth);
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
    if (isNaN(dob.getTime()) || age < 13) {
      throw new Error('You must be at least 13 years old to create an account.');
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          display_name: username,
          date_of_birth: opts.date_of_birth,
          terms_accepted_at: new Date().toISOString(),
          terms_version: CURRENT_TERMS_VERSION,
        },
      },
    });
    if (authError) throw authError;

    // Persist DOB + terms on the profile row (trigger creates the row via
    // handle_new_user; we update it with the extra fields here).
    if (authData.user) {
      await supabase
        .from('profiles')
        .update({
          date_of_birth: opts.date_of_birth,
          terms_accepted_at: new Date().toISOString(),
          terms_version: CURRENT_TERMS_VERSION,
        })
        .eq('id', authData.user.id);
    }

    return authData;
  },

  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  },

  async resetPassword(email: string) {
    // Deep link back into the app for the password-reset flow.
    const redirectTo = 'meecrowd://reset-password';
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    if (error) throw error;
  },

  /**
   * Apple Guideline 5.1.1(v) — in-app account deletion.
   * Calls the `request_account_deletion()` RPC which anonymizes the profile
   * and cascades owned content, then signs out locally.
   *
   * The `auth.users` row itself is cleaned up by a scheduled admin job
   * (see supabase/sweeper-delete-users edge function) within 30 days,
   * honoring the GDPR erasure window.
   */
  async deleteAccount() {
    const { error: rpcError } = await supabase.rpc('request_account_deletion');
    if (rpcError) throw rpcError;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw signOutError;
  },

  onAuthStateChange(callback: (event: string, session: any) => void) {
    return supabase.auth.onAuthStateChange(callback);
  },

  /** Open the user's email app after requesting a password reset. */
  async openMailApp() {
    try {
      await Linking.openURL('message://');
    } catch {
      // Ignore — user can open mail manually.
    }
  },
};
