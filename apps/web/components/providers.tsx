'use client';
// Proveedores globales del cliente: tema claro/oscuro, animaciones accesibles, avisos y los
// servicios de fondo (service worker, presencia y preferencia de sonido).
import { MotionConfig } from 'motion/react';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { AppServices } from './app-services';

export function Providers({
  children,
  reduceMotion,
  soundEnabled = true,
  signedIn = false,
}: {
  children: ReactNode;
  /** Preferencia guardada en el perfil (además de la del sistema operativo) */
  reduceMotion?: boolean;
  soundEnabled?: boolean;
  signedIn?: boolean;
}) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>
        {children}
        <AppServices signedIn={signedIn} soundEnabled={soundEnabled} />
        <Toaster
          position="top-center"
          richColors
          toastOptions={{ className: 'font-sans !rounded-2xl !border-2' }}
        />
      </MotionConfig>
    </ThemeProvider>
  );
}
