import axios, {
  AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import type { ApiEnvelope, ApiErrorBody, Paginated } from './types';
import { useAuthStore } from '@/stores/auth-store';

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export const api = axios.create({
  baseURL: API_BASE_URL,
  // Sends the refresh-token cookie when the API issues one.
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

type RetryableConfig = AxiosRequestConfig & { _retry?: boolean };

/**
 * A single in-flight refresh, shared by every request that 401s at the same
 * moment. Without this, a dashboard that fires eight parallel queries would
 * fire eight refreshes and rotate the token out from under itself.
 */
let refreshInFlight: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) throw new Error('No refresh token');

  const response = await axios.post<ApiEnvelope<{ accessToken: string; refreshToken: string }>>(
    `${API_BASE_URL}/auth/refresh`,
    { refreshToken },
    { withCredentials: true },
  );

  const tokens = response.data.data;
  useAuthStore.getState().setTokens(tokens.accessToken, tokens.refreshToken);
  return tokens.accessToken;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const config = error.config as RetryableConfig | undefined;
    const status = error.response?.status;

    const isAuthCall = config?.url?.includes('/auth/login') || config?.url?.includes('/auth/refresh');

    if (status === 401 && config && !config._retry && !isAuthCall) {
      config._retry = true;
      try {
        refreshInFlight ??= refreshAccessToken().finally(() => {
          refreshInFlight = null;
        });
        const accessToken = await refreshInFlight;
        config.headers = { ...config.headers, Authorization: `Bearer ${accessToken}` };
        return api(config);
      } catch {
        useAuthStore.getState().clear();
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          // A hard navigation, deliberately: this runs outside React (an axios
          // interceptor, with no router in scope), and a full reload is what
          // guarantees no in-memory state from the dead session survives.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = '/login';
        }
      }
    }

    return Promise.reject(error);
  },
);

/** Narrowed accessors so call sites never reach into `response.data.data`. */
export async function getData<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await api.get<ApiEnvelope<T>>(url, config);
  return response.data.data;
}

export async function getList<T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<Paginated<T>> {
  const response = await api.get<ApiEnvelope<T[]>>(url, config);
  return {
    data: response.data.data ?? [],
    meta: response.data.meta ?? {
      total: response.data.data?.length ?? 0,
      page: 1,
      limit: response.data.data?.length ?? 0,
    },
  };
}

export async function postData<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const response = await api.post<ApiEnvelope<T>>(url, body, config);
  return response.data?.data;
}

export async function patchData<T>(url: string, body?: unknown): Promise<T> {
  const response = await api.patch<ApiEnvelope<T>>(url, body);
  return response.data?.data;
}

export async function deleteData(url: string): Promise<void> {
  await api.delete(url);
}

export interface NormalisedApiError {
  status: number;
  code?: string;
  message: string;
  fieldErrors: Record<string, string>;
}

/**
 * Flattens an axios failure into something a form or a banner can render
 * directly, keeping the backend's `code` so callers can branch on known
 * business errors instead of showing a generic toast.
 */
export function normaliseError(error: unknown): NormalisedApiError {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    const body = error.response?.data;
    const fieldErrors: Record<string, string> = {};

    if (Array.isArray(body?.errors)) {
      for (const entry of body.errors as { field?: string; constraints?: string[] }[]) {
        if (entry?.field && entry.constraints?.length) {
          fieldErrors[entry.field] = entry.constraints[0];
        }
      }
    }

    const rawMessage = body?.message;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join(', ')
      : (rawMessage ??
        (error.code === 'ERR_NETWORK'
          ? 'Cannot reach the API. Is the backend running?'
          : error.message));

    return {
      status: error.response?.status ?? 0,
      code: body?.code,
      message,
      fieldErrors,
    };
  }

  return {
    status: 0,
    message: error instanceof Error ? error.message : 'Something went wrong',
    fieldErrors: {},
  };
}
