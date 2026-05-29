'use client';

import { SessionProvider } from 'next-auth/react';
import { ToastProvider } from '@/context/ToastContext';
import { ConfirmProvider } from '@/context/ConfirmContext';

export function Providers({ children }) {
  return (
    <SessionProvider>
      <ToastProvider>
        <ConfirmProvider>
          {children}
        </ConfirmProvider>
      </ToastProvider>
    </SessionProvider>
  );
}
