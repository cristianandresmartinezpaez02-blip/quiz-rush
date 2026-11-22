// Tarjeta de login/registro. Si el usuario ya tiene una cuenta real, lo envía a su destino.
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LogoMark } from '@/components/ui/logo';
import { authProviders } from '@/lib/auth';
import { getCurrentUser } from '@/lib/session';
import { AuthForm } from './auth-form';

export async function AuthCard({
  mode,
  returnTo,
}: {
  mode: 'signin' | 'signup';
  returnTo: string;
}) {
  const [t, user] = await Promise.all([getTranslations('auth'), getCurrentUser()]);
  // Los invitados sí pueden ver esta página: así convierten su sesión en una cuenta
  if (user && !user.isAnonymous) redirect(returnTo.startsWith('/') ? returnTo : '/mis-quizzes');

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-10 md:py-16">
      <div className="card p-6 shadow-[0_10px_0_0_var(--line)] md:p-8">
        <div className="mb-6 text-center">
          <LogoMark className="mx-auto mb-3 size-14 -rotate-6" />
          <h1 className="text-3xl font-extrabold">
            {mode === 'signin' ? t('signInTitle') : t('signUpTitle')}
          </h1>
          <p className="mt-1 text-muted">
            {mode === 'signin' ? t('signInSubtitle') : t('signUpSubtitle')}
          </p>
        </div>
        <AuthForm mode={mode} googleEnabled={authProviders.google} returnTo={returnTo} />
      </div>
    </div>
  );
}
