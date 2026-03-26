'use client';

import { create } from 'zustand';

import type { AuthToken } from '@/lib/types';

interface AuthStore {
  session: AuthToken | null;
  isLoading: boolean;
  error: string | null;
  setSession: (session: AuthToken | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  session: null,
  isLoading: false,
  error: null,
  setSession: (session) => set({ session }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  clear: () =>
    set({
      session: null,
      isLoading: false,
      error: null
    })
}));
