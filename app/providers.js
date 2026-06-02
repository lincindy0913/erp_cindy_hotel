'use client';

import { SessionProvider } from 'next-auth/react';
import { ToastProvider } from '@/context/ToastContext';
import { ConfirmProvider } from '@/context/ConfirmContext';
import ErrorBoundary from '@/components/ErrorBoundary';

export function Providers({ children }) {
  return (
    <ErrorBoundary>
      <SessionProvider>
        <ToastProvider>
          <ConfirmProvider>
            {children}
          </ConfirmProvider>
        </ToastProvider>
      </SessionProvider>
    </ErrorBoundary>
  );
}
