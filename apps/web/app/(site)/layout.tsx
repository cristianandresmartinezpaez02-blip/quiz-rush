import type { ReactNode } from 'react';
import { Header } from '@/components/layout/header';
import { MobileNav } from '@/components/layout/mobile-nav';
import { ScopedMessages } from '@/lib/scoped-messages';

// Resto del sitio: todos los textos (las páginas más visitadas y públicas están en (public),
// con solo los textos que usan).
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <ScopedMessages ns="all">
      <div className="bg-rush flex min-h-dvh flex-col">
        <Header />
        {/* En celular se deja espacio para la barra inferior */}
        <main id="contenido" className="flex-1 pb-20 md:pb-0">
          {children}
        </main>
        <MobileNav />
      </div>
    </ScopedMessages>
  );
}
