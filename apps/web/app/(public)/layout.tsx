import type { ReactNode } from 'react';
import { Header } from '@/components/layout/header';
import { MobileNav } from '@/components/layout/mobile-nav';
import { ScopedMessages } from '@/lib/scoped-messages';
import namespaces from '@/lib/public-namespaces.json';

// Páginas públicas más visitadas (portada, Biblioteca y ficha de quiz): mismo diseño que el
// resto del sitio, pero el navegador solo recibe los textos que usan sus componentes.
// La lista la calcula `node scripts/i18n-namespaces.mjs` (y una prueba comprueba que está al día).
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <ScopedMessages ns={namespaces}>
      <div className="bg-rush flex min-h-dvh flex-col">
        <Header />
        <main id="contenido" className="flex-1 pb-20 md:pb-0">
          {children}
        </main>
        <MobileNav />
      </div>
    </ScopedMessages>
  );
}
