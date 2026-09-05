import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AppUser } from '@/lib/api/types';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AppUser | null;
  hydrated: boolean;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: AppUser | null) => void;
  setHydrated: () => void;
  clear: () => void;
}

/**
 * Only the refresh token is persisted, and only to sessionStorage: it dies with
 * the tab, and the short-lived access token is kept in memory so an XSS payload
 * cannot lift a usable bearer token out of storage. On reload the app trades
 * the refresh token for a fresh access token via `AuthProvider`.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      hydrated: false,
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      setUser: (user) => set({ user }),
      setHydrated: () => set({ hydrated: true }),
      clear: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    {
      name: 'peoplepay360.session',
      storage: createJSONStorage(() =>
        typeof window === 'undefined' ? (undefined as never) : window.sessionStorage,
      ),
      partialize: (state) => ({ refreshToken: state.refreshToken }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
