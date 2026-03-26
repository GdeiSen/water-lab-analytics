'use client';

import { forwardRef } from 'react';
import clsx from 'clsx';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'sm';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={clsx(
        'inline-flex items-center justify-center border font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 disabled:cursor-not-allowed disabled:opacity-50',
        {
          'border-ink bg-ink text-white hover:bg-ink/90': variant === 'primary',
          'border-ink/30 bg-white text-ink hover:bg-ink/5': variant === 'secondary',
          'border-transparent bg-transparent text-ink hover:bg-ink/5': variant === 'ghost',
          'border-ember text-ember hover:bg-ember/5': variant === 'danger',
          'h-9 px-3': size === 'md',
          'h-8 px-2.5 text-sm': size === 'sm'
        },
        className
      )}
      {...props}
    />
  );
});
