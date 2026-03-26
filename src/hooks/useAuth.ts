'use client';

import { useCallback } from 'react';

import { api } from '@/lib/tauri-api';
import { useAuthStore } from '@/stores/auth-store';
import { useDataStore } from '@/stores/data-store';

export function useAuth() {
  const { session, isLoading, error, setSession, setLoading, setError, clear } = useAuthStore();
  const resetData = useDataStore((state) => state.resetData);

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
    login,
    logout
  };
}
