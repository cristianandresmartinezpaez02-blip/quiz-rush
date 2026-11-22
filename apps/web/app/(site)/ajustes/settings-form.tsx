'use client';
// Formulario de ajustes: perfil público, accesibilidad, privacidad y notificaciones. Valida con el mismo esquema que el API.
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { profileUpdateSchema } from '@quiz-rush/shared';
import { Button } from '@/components/ui/button';
import { PushToggle } from '@/components/notifications/push-toggle';
import { Field, Input, Switch, Textarea } from '@/components/ui/field';
import { cn } from '@/lib/utils';

interface Values {
  username: string;
  displayName: string;
  bio: string;
  country: string;
  reduceMotion: boolean;
  highContrast: boolean;
  extraTimePercent: number;
  soundEnabled: boolean;
  textScale: 100 | 115 | 130;
  showOnline: boolean;
  allowFriendRequests: boolean;
}

export function SettingsForm({ initial, isGuest }: { initial: Values; isGuest: boolean }) {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setV((s) => ({ ...s, [key]: value }));

  const errorText = (code?: string) => {
    if (!code) return undefined;
    return ['USERNAME_TAKEN', 'OFFENSIVE', 'USERNAME_CHARS'].includes(code)
      ? t(`errors.${code}` as 'errors.generic')
      : t('errors.generic');
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      ...(isGuest ? {} : { username: v.username }),
      displayName: v.displayName,
      bio: v.bio || null,
      country: v.country ? v.country.toUpperCase() : null,
      reduceMotion: v.reduceMotion,
      highContrast: v.highContrast,
      extraTimePercent: v.extraTimePercent,
      soundEnabled: v.soundEnabled,
      textScale: v.textScale,
      ...(isGuest ? {} : { showOnline: v.showOnline, allowFriendRequests: v.allowFriendRequests }),
    };
    const parsed = profileUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof Values, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Values;
        fieldErrors[key] ??= issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (res.status === 409) {
        setErrors({ username: 'USERNAME_TAKEN' });
        return;
      }
      if (!res.ok) throw new Error();
      // El sonido se aplica al momento en este dispositivo
      void import('@/lib/game/sounds').then((s) => s.setMuted(!v.soundEnabled));
      toast.success(t('saved'));
      router.refresh(); // aplica alto contraste / reducir animaciones al instante
    } catch {
      toast.error(t('errors.generic'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <section className="card flex flex-col gap-4 p-6">
        <h2 className="text-xl font-extrabold">{t('profileSection')}</h2>
        {isGuest ? (
          <p className="rounded-xl bg-accent/10 p-3 text-sm font-semibold text-accent">
            {t('guestNotice')}
          </p>
        ) : (
          <Field
            label={t('username')}
            help={t('usernameHelp', { username: v.username || '…' })}
            error={errorText(errors.username)}
          >
            {(p) => (
              <Input
                {...p}
                value={v.username}
                onChange={(e) => set('username', e.target.value.replace(/\s/g, ''))}
                maxLength={20}
                autoComplete="username"
              />
            )}
          </Field>
        )}
        <Field label={t('displayName')} error={errorText(errors.displayName)}>
          {(p) => (
            <Input
              {...p}
              value={v.displayName}
              onChange={(e) => set('displayName', e.target.value)}
              maxLength={32}
            />
          )}
        </Field>
        <Field label={t('bio')} error={errorText(errors.bio)}>
          {(p) => (
            <Textarea
              {...p}
              value={v.bio}
              onChange={(e) => set('bio', e.target.value)}
              maxLength={280}
              placeholder={t('bioPlaceholder')}
            />
          )}
        </Field>
        <Field label={t('country')} error={errors.country ? t('errors.generic') : undefined}>
          {(p) => (
            <Input
              {...p}
              value={v.country}
              onChange={(e) =>
                set(
                  'country',
                  e.target.value
                    .replace(/[^a-zA-Z]/g, '')
                    .slice(0, 2)
                    .toUpperCase(),
                )
              }
              placeholder="CO"
              className="w-24 uppercase"
            />
          )}
        </Field>
      </section>

      <section className="card flex flex-col gap-5 p-6">
        <h2 className="text-xl font-extrabold">{t('accessibilitySection')}</h2>
        <Switch
          checked={v.reduceMotion}
          onChange={(c) => set('reduceMotion', c)}
          label={t('reduceMotion')}
        />
        <Switch
          checked={v.highContrast}
          onChange={(c) => set('highContrast', c)}
          label={t('highContrast')}
        />
        <div>
          <label htmlFor="extra-time" className="flex justify-between text-sm font-bold">
            {t('extraTime')} <span className="text-accent">+{v.extraTimePercent}%</span>
          </label>
          <input
            id="extra-time"
            type="range"
            min={0}
            max={100}
            step={25}
            value={v.extraTimePercent}
            onChange={(e) => set('extraTimePercent', Number(e.target.value))}
            className="mt-2 w-full accent-accent"
          />
          <p className="text-xs text-muted">{t('extraTimeHelp')}</p>
        </div>
        <Switch
          checked={v.soundEnabled}
          onChange={(c) => set('soundEnabled', c)}
          label={t('soundEnabled')}
        />
        <fieldset>
          <legend className="text-sm font-bold">{t('textScale')}</legend>
          <div className="mt-2 flex gap-2" role="radiogroup" aria-label={t('textScale')}>
            {([100, 115, 130] as const).map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={v.textScale === n}
                onClick={() => set('textScale', n)}
                className={cn(
                  'flex-1 cursor-pointer rounded-xl border-2 py-2 font-extrabold',
                  v.textScale === n
                    ? 'border-accent bg-accent/15'
                    : 'border-line hover:border-accent/60',
                )}
                style={{ fontSize: `${n / 100}rem` }}
              >
                {t(`textScales.${n}`)}
              </button>
            ))}
          </div>
        </fieldset>
      </section>

      {!isGuest && (
        <section className="card flex flex-col gap-5 p-6">
          <h2 className="text-xl font-extrabold">{t('privacySection')}</h2>
          <Switch
            checked={v.showOnline}
            onChange={(c) => set('showOnline', c)}
            label={t('showOnline')}
          />
          <Switch
            checked={v.allowFriendRequests}
            onChange={(c) => set('allowFriendRequests', c)}
            label={t('allowFriendRequests')}
          />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-extrabold">{t('notificationsSection')}</h2>
        <PushToggle />
      </section>

      <Button type="submit" size="lg" loading={saving} className="self-start">
        {tc('save')}
      </Button>
    </form>
  );
}
