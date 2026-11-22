import type { ReactNode } from 'react';
import { ScopedMessages } from '@/lib/scoped-messages';

export default function Layout({ children }: { children: ReactNode }) {
  return <ScopedMessages ns="all">{children}</ScopedMessages>;
}
