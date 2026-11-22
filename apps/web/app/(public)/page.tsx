// Página de inicio: hero con llamada a la acción, caja de PIN y características.
import { Gamepad2, Save, Smartphone, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { AnswerIcon, answerStyle } from '@/components/ui/answer-shape';
import { PinBox } from './pin-box';

export default async function HomePage() {
  const t = await getTranslations('home');

  const features = [
    { icon: Save, title: t('feature1Title'), text: t('feature1Text') },
    { icon: Sparkles, title: t('feature2Title'), text: t('feature2Text') },
    { icon: Gamepad2, title: t('feature3Title'), text: t('feature3Text') },
    { icon: Smartphone, title: t('feature4Title'), text: t('feature4Text') },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 pt-10 pb-20 md:pt-16">
      <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-accent/15 px-3 py-1 text-sm font-bold text-accent">
            <span className="size-2 animate-pulse rounded-full bg-accent" /> {t('kicker')}
          </p>
          <h1 className="text-[min(3rem,12vw)] leading-[0.95] font-extrabold md:text-7xl">
            {t('title').split(' ').slice(0, -2).join(' ')}{' '}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              {t('title').split(' ').slice(-2).join(' ')}
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted">{t('subtitle')}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/mis-quizzes?nuevo=1">⚡ {t('ctaCreate')}</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/biblioteca">🎮 {t('ctaExplore')}</Link>
            </Button>
          </div>
        </div>

        <div className="relative">
          {/* Decoración: fichas de respuesta flotando */}
          <div className="pointer-events-none absolute -inset-6 -z-10" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={`absolute grid size-14 animate-float place-items-center rounded-2xl text-white shadow-lg ${answerStyle(i).bg}`}
                style={{
                  top: ['-4%', '8%', '78%', '70%'][i],
                  left: ['-6%', '88%', '-4%', '90%'][i],
                  animationDelay: `${i * 0.6}s`,
                  rotate: `${[-12, 10, 8, -10][i]}deg`,
                }}
              >
                <AnswerIcon index={i} />
              </span>
            ))}
          </div>
          <PinBox />
        </div>
      </section>

      <section className="mt-24" aria-labelledby="features-title">
        <h2 id="features-title" className="mb-8 text-center text-3xl font-extrabold md:text-4xl">
          {t('featuresTitle')}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="card group p-6 transition-transform hover:-translate-y-1">
              <span
                className={`mb-4 grid size-12 place-items-center rounded-2xl text-[#1a1640] ${answerStyle(i).bg} transition-transform group-hover:rotate-6`}
              >
                <Icon className="size-6" />
              </span>
              <h3 className="text-lg font-extrabold">{title}</h3>
              <p className="mt-1 text-sm text-muted">{text}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
