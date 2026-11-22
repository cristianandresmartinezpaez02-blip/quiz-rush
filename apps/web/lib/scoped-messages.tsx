// Envía al navegador solo los textos que necesita una sección (next-intl).
// Sin esto, cada página llevaba los ~76 KB de todos los textos de la app (dos veces: en el HTML
// y en los datos de React), lo que encarecía el renderizado y la descarga.
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';

export async function ScopedMessages({
  ns,
  children,
}: {
  /** Espacios de textos a enviar, o 'all' para todos */
  ns: readonly string[] | 'all';
  children: ReactNode;
}) {
  const all = await getMessages();
  const messages =
    ns === 'all' ? all : Object.fromEntries(ns.filter((k) => k in all).map((k) => [k, all[k]]));
  // `now` fija la referencia de las fechas relativas para que servidor y cliente coincidan
  return (
    <NextIntlClientProvider messages={messages} now={new Date()}>
      {children}
    </NextIntlClientProvider>
  );
}
