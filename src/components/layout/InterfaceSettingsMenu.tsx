'use client';

import { useEffect, useRef, useState } from 'react';
import { Bold, Check, Settings, Type } from 'lucide-react';
import clsx from 'clsx';

type InterfaceTheme = 'white';
type InterfaceScale = 'normal' | 'large' | 'extra-large' | 'huge' | 'maximum';

const SETTINGS_STORAGE_KEY = 'water-lab-interface-settings';

const scaleValues: Record<InterfaceScale, number> = {
  normal: 16,
  large: 18,
  'extra-large': 20,
  huge: 24,
  maximum: 32
};

const scaleMultipliers: Record<InterfaceScale, number> = {
  normal: 1,
  large: 1.125,
  'extra-large': 1.25,
  huge: 1.5,
  maximum: 2
};

interface InterfaceSettings {
  theme: InterfaceTheme;
  scale: InterfaceScale;
  boldText: boolean;
}

const defaultSettings: InterfaceSettings = {
  theme: 'white',
  scale: 'normal',
  boldText: false
};

export function InterfaceSettingsMenu() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<InterfaceSettings>(defaultSettings);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!saved) {
        return;
      }

      const parsed = JSON.parse(saved) as Partial<InterfaceSettings>;
      setSettings({
        theme: 'white',
        scale:
          parsed.scale === 'large' ||
          parsed.scale === 'extra-large' ||
          parsed.scale === 'huge' ||
          parsed.scale === 'maximum'
            ? parsed.scale
            : 'normal',
        boldText: parsed.boldText === true
      });
    } catch {
      setSettings(defaultSettings);
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('ui-theme-white', settings.theme === 'white');
    root.classList.toggle('ui-bold-font', settings.boldText);
    root.style.fontSize = `${scaleValues[settings.scale]}px`;
    root.style.setProperty('--ui-scale', String(scaleMultipliers[settings.scale]));

    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center border border-ink/30 bg-white text-ink transition hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
        aria-label="Настройки интерфейса"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Settings className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-72 border border-ink/25 bg-white p-3 text-sm text-ink shadow-panel">
          <div className="mb-3 flex items-center gap-2 border-b border-ink/15 pb-2 font-semibold">
            <Settings className="h-4 w-4" />
            Интерфейс
          </div>

          <div className="space-y-4">
            <section>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-ink/60">
                <Type className="h-3.5 w-3.5" />
                Размер
              </div>
              <div className="grid grid-cols-5 border border-ink/20">
                {(['normal', 'large', 'extra-large', 'huge', 'maximum'] as InterfaceScale[]).map((scale) => (
                  <button
                    key={scale}
                    type="button"
                    className={clsx(
                      'flex h-9 items-center justify-center border-r border-ink/20 px-2 text-xs last:border-r-0 hover:bg-ink/5',
                      settings.scale === scale && 'bg-ink text-white hover:bg-ink'
                    )}
                    onClick={() => setSettings((current) => ({ ...current, scale }))}
                  >
                    {scale === 'normal'
                      ? '100%'
                      : scale === 'large'
                        ? '112%'
                        : scale === 'extra-large'
                          ? '125%'
                          : scale === 'huge'
                            ? '150%'
                            : '200%'}
                  </button>
                ))}
              </div>
            </section>

            <button
              type="button"
              className={clsx(
                'flex h-10 w-full items-center justify-between border border-ink/25 px-3 text-left hover:bg-ink/5',
                settings.boldText && 'bg-ink text-white hover:bg-ink'
              )}
              onClick={() =>
                setSettings((current) => ({ ...current, boldText: !current.boldText }))
              }
            >
              <span className="inline-flex items-center gap-2">
                <Bold className="h-4 w-4" />
                Жирный шрифт
              </span>
              {settings.boldText && <Check className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
