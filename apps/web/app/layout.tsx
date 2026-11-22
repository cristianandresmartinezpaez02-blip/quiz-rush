import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Nunito_Sans } from 'next/font/google';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import { ScopedMessages } from '@/lib/scoped-messages';
import { getCurrentUser } from '@/lib/session';
import { cn } from '@/lib/utils';
import './globals.css';

// Tipografía display con personalidad para títulos + una muy legible para el texto
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  weight: ['500', '700', '800'],
  display: 'swap',
});
const sans = Nunito_Sans({ subsets: ['latin'], variable: '--font-nunito', display: 'swap' });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return {
    title: { default: t('title'), template: '%s · Quiz_Rush' },
    description: t('description'),
    applicationName: 'Quiz_Rush',
    metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
    icons: { icon: '/icon.svg', apple: '/icons/apple-touch-icon.png' },
    appleWebApp: { capable: true, title: 'Quiz_Rush', statusBarStyle: 'black-translucent' },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0e0b26' },
    { media: '(prefers-color-scheme: light)', color: '#fff8ec' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [locale, user] = await Promise.all([getLocale(), getCurrentUser()]);
  const t = await getTranslations('common');
  const prefs = user?.profile;

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={cn(
        display.variable,
        sans.variable,
        prefs?.reduceMotion && 'reduce-motion',
        prefs?.highContrast && 'high-contrast',
        prefs?.textScale === 115 && 'text-scale-115',
        prefs?.textScale === 130 && 'text-scale-130',
      )}
    >
      <body className="min-h-dvh">
        <a
          href="#contenido"
          className="sr-only z-50 rounded-xl bg-primary px-4 py-2 font-bold text-primary-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          {t('skipToContent')}
        </a>
        {/* Cada sección envía sus propios textos (ScopedMessages en su layout); aquí solo los comunes */}
        <ScopedMessages ns={['common']}>
          <Providers
            reduceMotion={prefs?.reduceMotion}
            soundEnabled={prefs?.soundEnabled ?? true}
            signedIn={!!user}
          >
            {children}
          </Providers>
        </ScopedMessages>
      </body>
    </html>
  );
}
