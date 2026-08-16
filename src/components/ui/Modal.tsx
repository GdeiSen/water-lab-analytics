'use client';

import { ReactNode } from 'react';
import clsx from 'clsx';

import { Button } from '@/components/ui/Button';

interface ModalProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Tailwind max-width class for the modal panel. Defaults to `max-w-2xl`. */
  widthClassName?: string;
}

export function Modal({ title, open, onClose, children, widthClassName = 'max-w-2xl' }: ModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
      <div className={clsx('w-full border border-ink/30 bg-white p-6', widthClassName)}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-ink">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Закрыть
          </Button>
        </div>
        <div className="max-h-[70vh] overflow-auto">{children}</div>
      </div>
    </div>
  );
}
