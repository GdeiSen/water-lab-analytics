'use client';

import { forwardRef } from 'react';
import clsx from 'clsx';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string | null;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, error, ...props },
  ref
) {
  return (
    <label className="flex w-full flex-col gap-1.5 text-sm font-medium text-ink/80">
      {label && <span>{label}</span>}
      <input
        ref={ref}
        className={clsx(
          'h-10 border border-ink/30 bg-white px-3 text-ink placeholder:text-ink/45 transition focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/20',
          error && 'border-ember focus:border-ember focus:ring-ember/20',
          className
        )}
        {...props}
      />
      {error && <span className="text-xs text-ember">{error}</span>}
    </label>
  );
});
