'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { API_BASE_URL, postData } from '@/lib/api/client';
import type { AppUser, ApiEnvelope, LoginResponse, RoleName } from '@/lib/api/types';
import { useAuthStore } from '@/stores/auth-store';
import { useCurrentUser } from '@/hooks/use-resources';
import { can, homeRouteFor, isSelfService, type Action, type Subject } from '@/lib/abilities';

interface AuthContextValue {
  user: AppUser | null;
  role: RoleName | null;
  loading: boolean;
  authenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  can: (action: Action, subject: Subject) => boolean;
  selfService: boolean;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

const PUBLIC_ROUTES = ['/login'];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const { accessToken, refreshToken, hydrated, setTokens, clear } = useAuthStore();
  const [restoring, setRestoring] = React.useState(true);

  /**
   * The access token lives only in memory, so a page reload starts with
   * nothing. If a refresh token survived in sessionStorage, trade it for a new
   * access token before deciding the visitor is signed out.
   */
  React.useEffect(() => {
    if (!hydrated) return;

    let cancelled = false;

    async function restore() {
      if (accessToken) {
        setRestoring(false);
        return;
      }

      if (!refreshToken) {
        setRestoring(false);
        return;
      }

      try {
        const response = await axios.post<ApiEnvelope<{ accessToken: string; refreshToken: string }>>(
          `${API_BASE_URL}/auth/refresh`,
          { refreshToken },
          { withCredentials: true },
        );
        if (!cancelled) {
          setTokens(response.data.data.accessToken, response.data.data.refreshToken);
        }
      } catch {
        if (!cancelled) clear();
      } finally {
        if (!cancelled) setRestoring(false);
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
    // Intentionally keyed on hydration only: this runs once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const { data: user, isLoading: userLoading } = useCurrentUser(Boolean(accessToken));

  const loading = !hydrated || restoring || (Boolean(accessToken) && userLoading);
  const authenticated = Boolean(accessToken && user);
  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname?.startsWith(route));

  React.useEffect(() => {
    if (loading) return;
    if (!authenticated && !isPublicRoute) {
      router.replace('/login');
    }
    if (authenticated && isPublicRoute) {
      router.replace(homeRouteFor(user?.role));
    }
  }, [loading, authenticated, isPublicRoute, router, user?.role]);

  const login = React.useCallback(
    async (email: string, password: string) => {
      const result = await postData<LoginResponse>('/auth/login', { email, password });
      setTokens(result.accessToken, result.refreshToken);
      // Drop any cache belonging to the previous session before the new one loads.
      queryClient.clear();
      router.replace(homeRouteFor(result.user?.role));
    },
    [setTokens, queryClient, router],
  );

  const logout = React.useCallback(() => {
    clear();
    queryClient.clear();
    router.replace('/login');
  }, [clear, queryClient, router]);

  const role = user?.role ?? null;

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user: user ?? null,
      role,
      loading,
      authenticated,
      login,
      logout,
      can: (action, subject) => can(role, action, subject),
      selfService: isSelfService(role),
    }),
    [user, role, loading, authenticated, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
