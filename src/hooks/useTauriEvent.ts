'use client';

import { useEffect } from 'react';

export function useTauriEvent<T>(
  subscribe: (handler: (payload: T) => void) => Promise<() => void>,
  handler: (payload: T) => void
) {
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let active = true;

    Promise.resolve()
      .then(() =>
        subscribe((payload: T) => {
          if (active) {
            handler(payload);
          }
        })
      )
      .then((dispose) => {
        unlisten = dispose;
      })
      .catch(() => {
        // silently ignore when app runs outside Tauri
      });

    return () => {
      active = false;
      if (unlisten) {
        unlisten();
      }
    };
  }, [subscribe, handler]);
}
