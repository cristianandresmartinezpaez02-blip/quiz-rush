'use client';
// Caja para unirse a una partida con PIN (la conexión real llega en la Fase 3).
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { haptic } from '@/lib/utils';

export function PinBox() {
  const t = useTranslations('home');
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(0);

  return (
    <motion.form
      key={shake}
      animate={shake ? { x: [0, -10, 10, -6, 6, 0] } : undefined}
      transition={{ duration: 0.35 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (pin.length !== 6) {
          setShake((s) => s + 1);
          haptic([20, 40, 20]);
          return;
        }
        router.push(`/jugar?pin=${pin}`);
      }}
      className="card mx-auto flex w-full max-w-sm flex-col gap-4 p-6 shadow-[0_10px_0_0_var(--line)]"
    >
      <h2 className="text-center text-2xl font-extrabold">{t('pinTitle')}</h2>
      <label className="sr-only" htmlFor="pin">
        {t('pinPlaceholder')}
      </label>
      <input
        id="pin"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder={t('pinPlaceholder')}
        size={6}
        className="h-16 w-full min-w-0 rounded-2xl border-2 border-line bg-surface-2 text-center font-display text-3xl font-extrabold tracking-[0.3em] outline-none placeholder:text-base placeholder:tracking-normal focus:border-accent"
      />
      <Button type="submit" size="lg" variant="accent">
        {t('pinJoin')}
      </Button>
    </motion.form>
  );
}
