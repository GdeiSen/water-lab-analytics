import type { Metadata } from 'next';
import { Toaster } from 'sonner';

import '@/app/globals.css';

export const metadata: Metadata = {
  title: 'Water Lab Analytics',
  description: 'Система визуализации и анализа лабораторных данных водоочистительной станции'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="font-display antialiased">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
