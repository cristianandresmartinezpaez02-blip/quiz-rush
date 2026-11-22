'use client';
// Formulario de autenticación: email + contraseña, enlace mágico, Google y modo invitado.
// Si un invitado se registra, Better Auth vincula la cuenta y conserva todo lo que hizo.
import { motion } from 'motion/react';
import { Mail, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { containsProfanity } from '@quiz-rush/shared';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { authClient } from '@/lib/auth-client';

interface AuthFormProps {
  mode: 'signin' | 'signup';
  googleEnabled: boolean;
  returnTo: string;
}

type AuthErr = { code?: string; status?: number; message?: string } | null | undefined;

export function AuthForm({ mode, googleEnabled, returnTo }: AuthFormProps) {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const router = useRouter();
  const [method, setMethod] = useState<'password' | 'magic'>('password');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<null | 'form' | 'google' | 'guest'>(null);
  const [magicSent, setMagicSent] = useState(false);

  const target = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/mis-quizzes';

  function explain(err: AuthErr): string {
    if (!err) return t('errors.generic');
    if (err.status === 429) return t('errors.rateLimited');
    const code = err.code ?? '';
    if (code.includes('INVALID_EMAIL_OR_PASSWORD') || code.includes('INVALID_PASSWORD'))
      return t('errors.invalidCredentials');
    if (code.includes('USER_ALREADY_EXISTS')) return t('errors.userExists');
    if (code.includes('PASSWORD_TOO_SHORT')) return t('errors.weakPassword');
    if (code.includes('INVALID_EMAIL')) return t('errors.invalidEmail');
    return t('errors.generic');
  }

  function done() {
    router.push(target);
    router.refresh();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === 'signup' && method === 'password' && containsProfanity(name, { strict: true })) {
      setError(t('errors.offensive'));
      return;
    }
    setLoading('form');
    try {
      if (method === 'magic') {
        const { error } = await authClient.signIn.magicLink({
          email,
          callbackURL: target,
          name: name || undefined,
        });
        if (error) setError(explain(error));
        else setMagicSent(true);
        return;
      }
      const { error } =
        mode === 'signup'
          ? await authClient.signUp.email({ name: name.trim(), email, password })
          : await authClient.signIn.email({ email, password });
      if (error) setError(explain(error));
      else done();
    } finally {
      setLoading(null);
    }
  }

  async function google() {
    setLoading('google');
    const { error } = await authClient.signIn.social({ provider: 'google', callbackURL: target });
    if (error) {
      setError(explain(error));
      setLoading(null);
    }
  }

  async function guest() {
    setLoading('guest');
    const { error } = await authClient.signIn.anonymous();
    setLoading(null);
    if (error) setError(explain(error));
    else done();
  }

  if (magicSent) {
    return (
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-center"
      >
        <div className="mb-4 animate-float text-6xl" aria-hidden="true">
          📬
        </div>
        <p className="text-lg font-bold">{t('magicLinkSent')}</p>
        {process.env.NODE_ENV !== 'production' && (
          <p className="mt-2 text-sm text-muted">{t('magicLinkDev')}</p>
        )}
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {googleEnabled && (
        <Button
          variant="outline"
          size="lg"
          onClick={google}
          loading={loading === 'google'}
          type="button"
        >
          <GoogleIcon /> {t('google')}
        </Button>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {mode === 'signup' && method === 'password' && (
          <Field label={t('name')}>
            {(p) => (
              <Input
                {...p}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                maxLength={32}
                autoComplete="name"
              />
            )}
          </Field>
        )}
        <Field label={t('email')}>
          {(p) => (
            <Input
              {...p}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          )}
        </Field>
        {method === 'password' && (
          <Field label={t('password')} help={mode === 'signup' ? t('passwordHint') : undefined}>
            {(p) => (
              <Input
                {...p}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            )}
          </Field>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger"
          >
            {error}
          </p>
        )}

        <Button type="submit" size="lg" loading={loading === 'form'}>
          {method === 'magic' ? (
            <>
              <Mail className="size-5" /> {t('magicLink')}
            </>
          ) : mode === 'signup' ? (
            t('submitSignUp')
          ) : (
            t('submitSignIn')
          )}
        </Button>
        <button
          type="button"
          onClick={() => setMethod((m) => (m === 'password' ? 'magic' : 'password'))}
          className="cursor-pointer text-sm font-semibold text-muted underline underline-offset-4 hover:text-fg"
        >
          {method === 'password' ? t('useMagicLink') : t('usePassword')}
        </button>
      </form>

      <div className="flex items-center gap-3 text-xs font-bold text-muted uppercase">
        <span className="h-0.5 flex-1 bg-line" /> {tc('or')}{' '}
        <span className="h-0.5 flex-1 bg-line" />
      </div>

      <div className="text-center">
        <Button
          variant="accent"
          size="lg"
          className="w-full"
          onClick={guest}
          loading={loading === 'guest'}
          type="button"
        >
          <UserRound className="size-5" /> {t('guest')}
        </Button>
        <p className="mt-2 text-xs text-muted">{t('guestHint')}</p>
      </div>

      <p className="text-center text-sm text-muted">
        {mode === 'signin' ? t('noAccount') : t('haveAccount')}{' '}
        <Link
          href={`${mode === 'signin' ? '/registro' : '/entrar'}?volver=${encodeURIComponent(target)}`}
          className="font-bold text-accent"
        >
          {mode === 'signin' ? t('goSignUp') : t('goSignIn')}
        </Link>
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.7 2.3 2.4 6.6 2.4 12s4.3 9.7 9.6 9.7c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12Z"
      />
    </svg>
  );
}
