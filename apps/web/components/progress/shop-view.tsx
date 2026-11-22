'use client';
// Tienda + editor de avatar en vivo. Las piezas bloqueadas muestran su precio: al elegir una se
// ofrece comprarla. Solo se guardan piezas gratuitas o compradas (el servidor también lo valida).
import { Check, Lock, Save, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AVATAR_COLORS,
  AVATAR_PARTS,
  AVATAR_SLOTS,
  avatarItemCode,
  isFreePart,
  lockedParts,
  RARITY_COLOR,
  type AvatarConfig,
  type AvatarSlot,
  type ShopItemDef,
} from '@quiz-rush/shared';
import { AvatarArt } from '@/components/avatar/avatar-art';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/client-api';
import { burstConfetti } from '@/lib/game/effects';
import { playSfx } from '@/lib/game/sounds';
import { cn } from '@/lib/utils';

type ShopData = {
  coins: number;
  avatar: AvatarConfig;
  celebration: string | null;
  items: (ShopItemDef & { owned: boolean })[];
};

export function ShopView({ initial }: { initial: ShopData }) {
  const t = useTranslations('shop');
  const te = useTranslations('errors');
  const format = useFormatter();
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [draft, setDraft] = useState<AvatarConfig>(initial.avatar);
  const [slot, setSlot] = useState<AvatarSlot>('body');
  const [busy, setBusy] = useState<string | null>(null);

  const owned = useMemo(
    () => new Set(data.items.filter((i) => i.owned).map((i) => i.code)),
    [data.items],
  );
  const locked = lockedParts(draft, owned);
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.avatar);
  const errorText = (code: string) => (te.has(code) ? te(code as 'INTERNAL') : te('INTERNAL'));

  async function buy(code: string) {
    setBusy(code);
    try {
      const { coins } = await apiFetch<{ coins: number }>('/api/shop/buy', {
        method: 'POST',
        body: { code },
      });
      setData((d) => ({
        ...d,
        coins,
        items: d.items.map((i) => (i.code === code ? { ...i, owned: true } : i)),
      }));
      playSfx('correct');
      burstConfetti(0.6);
      toast.success(t('bought'));
      router.refresh();
    } catch (err) {
      toast.error(errorText((err as Error).message));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy('save');
    try {
      const { config } = await apiFetch<{ config: AvatarConfig }>('/api/avatar', {
        method: 'PUT',
        body: { config: draft },
      });
      setData((d) => ({ ...d, avatar: config }));
      toast.success(t('saved'));
      router.refresh();
    } catch (err) {
      toast.error(errorText((err as Error).message));
    } finally {
      setBusy(null);
    }
  }

  async function equip(code: string | null) {
    setBusy(code ?? 'confetti');
    try {
      await apiFetch('/api/shop/celebration', { method: 'POST', body: { code } });
      setData((d) => ({ ...d, celebration: code }));
      burstConfetti(0.8);
    } catch (err) {
      toast.error(errorText((err as Error).message));
    } finally {
      setBusy(null);
    }
  }

  const parts = [...AVATAR_PARTS[slot].free, ...AVATAR_PARTS[slot].shop] as string[];
  const itemFor = (part: string) => data.items.find((i) => i.code === avatarItemCode(slot, part));

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
      {/* Vista previa */}
      <section
        className="card flex flex-col items-center gap-4 p-5 lg:sticky lg:top-24 lg:self-start"
        aria-label={t('preview')}
      >
        <p className="self-end rounded-full bg-surface-2 px-3 py-1 font-display font-black">
          🪙 {format.number(data.coins)}
        </p>
        <AvatarArt config={draft} size={220} title={t('preview')} />
        <fieldset className="w-full">
          <legend className="mb-2 text-sm font-bold">{t('color')}</legend>
          <div className="flex flex-wrap gap-2">
            {AVATAR_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                aria-pressed={draft.color === c}
                onClick={() => setDraft((d) => ({ ...d, color: c }))}
                className={cn(
                  'size-9 cursor-pointer rounded-full border-4 shadow',
                  draft.color === c ? 'scale-110 border-fg' : 'border-transparent',
                )}
                style={{ background: c }}
              />
            ))}
          </div>
        </fieldset>
        {locked.length > 0 && (
          <p role="status" className="w-full rounded-xl bg-accent/15 px-3 py-2 text-sm font-bold">
            <Lock className="mr-1 inline size-4" /> {t('lockedHint')}
          </p>
        )}
        <div className="flex w-full gap-2">
          <Button
            variant="outline"
            className="flex-1"
            disabled={!dirty}
            onClick={() => setDraft(data.avatar)}
          >
            {t('reset')}
          </Button>
          <Button
            className="flex-1"
            disabled={!dirty || locked.length > 0}
            loading={busy === 'save'}
            onClick={save}
          >
            <Save className="size-4" /> {t('save')}
          </Button>
        </div>
      </section>

      <div className="flex min-w-0 flex-col gap-6">
        {/* Piezas por ranura */}
        <section className="card p-5">
          <div role="tablist" aria-label={t('slots')} className="mb-4 flex flex-wrap gap-2">
            {AVATAR_SLOTS.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={slot === s}
                onClick={() => setSlot(s)}
                className={cn(
                  'cursor-pointer rounded-xl px-4 py-2 text-sm font-extrabold',
                  slot === s ? 'bg-accent text-accent-ink' : 'bg-surface-2 hover:bg-line',
                )}
              >
                {t(`slot.${s}`)}
              </button>
            ))}
          </div>
          <ul role="tabpanel" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {parts.map((part) => {
              const item = itemFor(part);
              const free = isFreePart(slot, part);
              const has = free || owned.has(avatarItemCode(slot, part));
              const selected = draft[slot] === part;
              return (
                <li key={part}>
                  <div
                    className={cn(
                      'flex h-full flex-col items-center gap-2 rounded-2xl border-2 p-3 text-center transition',
                      selected ? 'border-accent bg-accent/10' : 'border-line',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, [slot]: part }))}
                      aria-pressed={selected}
                      aria-label={t(`parts.${part}`)}
                      className="cursor-pointer rounded-full transition hover:scale-105"
                    >
                      <AvatarArt config={{ ...draft, [slot]: part }} size={84} />
                    </button>
                    <span className="text-sm font-extrabold">{t(`parts.${part}`)}</span>
                    {item && (
                      <span
                        className="text-[10px] font-black uppercase"
                        style={{ color: RARITY_COLOR[item.rarity] }}
                      >
                        {t(`rarity.${item.rarity}`)}
                      </span>
                    )}
                    {has ? (
                      <span className="flex items-center gap-1 text-xs font-bold text-success">
                        <Check className="size-4" /> {free ? t('free') : t('owned')}
                      </span>
                    ) : item?.seasonOnly ? (
                      <span className="text-xs font-bold text-muted">🎟️ {t('seasonOnly')}</span>
                    ) : item ? (
                      <Button
                        size="sm"
                        variant={data.coins >= item.price ? 'primary' : 'outline'}
                        disabled={data.coins < item.price}
                        loading={busy === item.code}
                        onClick={() => buy(item.code)}
                      >
                        🪙 {format.number(item.price)}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Celebraciones */}
        <section className="card p-5" aria-labelledby="celebrations-title">
          <h2 id="celebrations-title" className="mb-1 text-xl font-extrabold">
            <Sparkles className="mr-1 inline size-5" /> {t('celebrations')}
          </h2>
          <p className="mb-3 text-sm text-muted">{t('celebrationsHelp')}</p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <li>
              <CelebrationCard
                label={t('celebration.confetti')}
                emoji="🎊"
                active={!data.celebration}
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!data.celebration}
                    onClick={() => equip(null)}
                  >
                    {!data.celebration ? t('equipped') : t('equip')}
                  </Button>
                }
              />
            </li>
            {data.items
              .filter((i) => i.type === 'CELEBRATION')
              .map((i) => (
                <li key={i.code}>
                  <CelebrationCard
                    label={t(`celebration.${i.celebration}`)}
                    emoji={
                      { fireworks: '🎆', hearts: '💖', stars: '🌟', emoji: '🤩' }[
                        i.celebration ?? ''
                      ] ?? '✨'
                    }
                    active={data.celebration === i.code}
                    action={
                      i.owned ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={data.celebration === i.code}
                          loading={busy === i.code}
                          onClick={() => equip(i.code)}
                        >
                          {data.celebration === i.code ? t('equipped') : t('equip')}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          disabled={data.coins < i.price}
                          loading={busy === i.code}
                          onClick={() => buy(i.code)}
                        >
                          🪙 {format.number(i.price)}
                        </Button>
                      )
                    }
                  />
                </li>
              ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function CelebrationCard({
  label,
  emoji,
  active,
  action,
}: {
  label: string;
  emoji: string;
  active: boolean;
  action: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex h-full flex-col items-center gap-2 rounded-2xl border-2 p-3 text-center',
        active ? 'border-accent bg-accent/10' : 'border-line',
      )}
    >
      <span className="text-4xl" aria-hidden="true">
        {emoji}
      </span>
      <span className="text-sm font-extrabold">{label}</span>
      {action}
    </div>
  );
}
