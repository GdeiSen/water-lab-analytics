'use client';

import { useCallback, useEffect, useRef } from 'react';

import { AUTH_BYPASS_CREDENTIALS, AUTH_BYPASS_ENABLED } from '@/lib/app-config';
import { api } from '@/lib/tauri-api';
import { useAuthStore } from '@/stores/auth-store';
import { useDataStore } from '@/stores/data-store';

export function useAuth() {
  const { session, isLoading, error, setSession, setLoading, setError, clear } = useAuthStore();
  const resetData = useDataStore((state) => state.resetData);
  const bypassAttemptedRef = useRef(false);

  const login = useCallback(
    async (username: string, password: string) => {
      setLoading(true);
      setError(null);
      try {
        const token = await api.login(username, password);
        setSession(token);
        return token;
      } catch (loginError) {
        const message = loginError instanceof Error ? loginError.message : 'Ошибка входа';
        setError(message);
        throw loginError;
      } finally {
        setLoading(false);
      }
    },
    [setError, setLoading, setSession]
  );

  useEffect(() => {
    if (!AUTH_BYPASS_ENABLED || session || isLoading || bypassAttemptedRef.current) {
      return;
    }

    bypassAttemptedRef.current = true;
    void login(AUTH_BYPASS_CREDENTIALS.username, AUTH_BYPASS_CREDENTIALS.password);
  }, [isLoading, login, session]);

  const logout = useCallback(async () => {
    try {
      if (session) {
        await api.logout(session.token);
      }
    } finally {
      clear();
      resetData();
    }
  }, [clear, resetData, session]);

  return {
    session,
    isLoading,
    error,
    authBypassEnabled: AUTH_BYPASS_ENABLED,
    login,
    logout
  };
}
