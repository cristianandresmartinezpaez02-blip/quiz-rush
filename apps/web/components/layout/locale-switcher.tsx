'use client';
import { Languages } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { setLocale } from '@/i18n/actions';
import { LOCALES } from '@/i18n/config';

export function LocaleSwitcher() {
  const locale = useLocale();
  const t = useTranslations('nav');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className="relative flex h-10 cursor-pointer items-center gap-1 rounded-xl px-2 hover:bg-surface-2">
      <Languages className="size-4" aria-hidden="true" />
      <span className="sr-only">{t('language')}</span>
      <select
        value={locale}
        disabled={pending}
        onChange={(e) =>
          startTransition(async () => {
            await setLocale(e.target.value);
            router.refresh();
          })
        }
        className="cursor-pointer appearance-none bg-transparent text-sm font-bold uppercase outline-none"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} className="bg-surface text-fg">
            {l.toUpperCase()}
          </option>
        ))}
      </select>
    </label>
  );
}
