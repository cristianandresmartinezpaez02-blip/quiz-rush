'use client';
// Barra de acciones del quiz: jugar, favorito, colección, remix, compartir, reportar y calificar.
// El estado personal (¿ya es favorito?, ¿mi nota?) se pide al cargar, así la página pública
// puede cachearse igual para todos.
import { motion } from 'motion/react';
import {
  Bookmark,
  Dumbbell,
  Flag,
  GitFork,
  Heart,
  Pencil,
  Play,
  Share2,
  Target,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { StarRating } from '@/components/library/stars';
import { useAuthGuard, type Viewer } from '@/components/social/use-auth-guard';
import { Button } from '@/components/ui/button';
import { cn, haptic } from '@/lib/utils';
import { startSoloGame } from '@/lib/client-api';
import { ChallengeDialog } from './challenge-dialog';
import { CollectionDialog } from './collection-dialog';
import { ReportDialog } from './report-dialog';
import { ShareDialog } from './share-dialog';

const EMPTY_STATE: ViewerState = {
  isAuthor: false,
  favorited: false,
  myRating: null,
  collectionIds: [],
  reported: false,
};

interface ViewerState {
  isAuthor: boolean;
  favorited: boolean;
  myRating: number | null;
  collectionIds: string[];
  reported: boolean;
}

export function QuizActions({
  quizId,
  title,
  shareUrl,
  viewer,
  favoriteCount,
  ratingAvg,
  ratingCount,
}: {
  quizId: string;
  title: string;
  shareUrl: string;
  viewer: Viewer | null;
  favoriteCount: number;
  ratingAvg: number;
  ratingCount: number;
}) {
  const t = useTranslations('quiz');
  const format = useFormatter();
  const router = useRouter();
  const guard = useAuthGuard(viewer);
  // Estado personal: valores neutros hasta que llega la respuesta de /me
  const [state, setState] = useState<ViewerState>(EMPTY_STATE);
  // Mientras no se conoce el estado real, las acciones personales se deshabilitan
  // (si no, un clic rápido podría alternar en la dirección equivocada)
  const [loaded, setLoaded] = useState(!viewer);
  const [favorites, setFavorites] = useState(favoriteCount);
  const [rating, setRating] = useState({ avg: ratingAvg, count: ratingCount });
  const [dialog, setDialog] = useState<null | 'share' | 'collection' | 'report' | 'challenge'>(
    null,
  );
  const [practicing, setPracticing] = useState(false);
  const [remixing, setRemixing] = useState(false);
  const [hosting, setHosting] = useState(false);

  /** Crea una partida en vivo con este quiz y abre la pantalla del anfitrión. */
  async function host() {
    if (!guard()) return;
    setHosting(true);
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quizId }),
      });
      if (!res.ok) throw new Error();
      const { gameId } = (await res.json()) as { gameId: string };
      router.push(`/host/${gameId}`);
    } catch {
      toast.error(t('actionError'));
      setHosting(false);
    }
  }

  /** Practicar en solitario (sin presión de tiempo, con la solución tras cada pregunta). */
  async function practice() {
    if (!guard()) return;
    setPracticing(true);
    try {
      router.push(`/solo/${await startSoloGame({ mode: 'PRACTICE', quizId })}`);
    } catch {
      toast.error(t('actionError'));
      setPracticing(false);
    }
  }

  useEffect(() => {
    if (!viewer) return;
    let cancelled = false;
    fetch(`/api/quizzes/${quizId}/me`)
      .then((r) => (r.ok ? (r.json() as Promise<ViewerState>) : null))
      .then((d) => {
        if (cancelled) return;
        if (d) setState(d);
        setLoaded(true);
      })
      // Sin conexión: se habilitan igual (con valores neutros) para no bloquear la página
      .catch(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [quizId, viewer]);

  async function toggleFavorite() {
    if (!guard()) return;
    const on = !state.favorited;
    haptic(on ? [10, 30, 10] : 10);
    setState((s) => ({ ...s, favorited: on }));
    setFavorites((n) => n + (on ? 1 : -1));
    const res = await fetch(`/api/quizzes/${quizId}/favorite`, { method: on ? 'POST' : 'DELETE' });
    if (!res.ok) {
      setState((s) => ({ ...s, favorited: !on }));
      setFavorites((n) => n - (on ? 1 : -1));
      toast.error(t('actionError'));
    } else if (on) toast.success(t('addedToFavorites'));
  }

  async function rate(stars: number) {
    if (!guard(true)) return;
    const previous = state.myRating ?? null;
    setState((s) => ({ ...s, myRating: stars }));
    const res = await fetch(`/api/quizzes/${quizId}/rating`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stars }),
    });
    if (!res.ok) {
      setState((s) => ({ ...s, myRating: previous }));
      toast.error(t('actionError'));
      return;
    }
    const data = (await res.json()) as { ratingAvg: number; ratingCount: number };
    setRating({ avg: data.ratingAvg, count: data.ratingCount });
    toast.success(t('ratedToast', { count: stars }));
  }

  async function remix() {
    if (!guard()) return;
    setRemixing(true);
    try {
      const res = await fetch(`/api/quizzes/${quizId}/remix`, { method: 'POST' });
      if (!res.ok) throw new Error();
      const { id } = (await res.json()) as { id: string };
      toast.success(t('remixCreated'));
      router.push(`/crear/${id}`);
    } catch {
      toast.error(t('actionError'));
      setRemixing(false);
    }
  }

  const iconBtn =
    'flex h-12 cursor-pointer items-center gap-2 rounded-2xl border-2 border-line bg-surface px-4 font-bold transition-all hover:-translate-y-0.5 hover:border-accent/60 active:translate-y-0 disabled:cursor-wait disabled:opacity-60';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="lg" onClick={host} loading={hosting}>
          <Play className="size-5 fill-current" /> {t('host')}
        </Button>
        <Button size="lg" variant="outline" onClick={practice} loading={practicing}>
          <Dumbbell className="size-5" /> {t('practice')}
        </Button>
        <Button size="lg" variant="outline" onClick={() => guard() && setDialog('challenge')}>
          <Target className="size-5" /> {t('challenge')}
        </Button>
        {state.isAuthor && (
          <Button asChild size="lg" variant="outline">
            <Link href={`/crear/${quizId}`}>
              <Pencil className="size-5" /> {t('edit')}
            </Link>
          </Button>
        )}
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={toggleFavorite}
          disabled={!loaded}
          aria-busy={!loaded || undefined}
          aria-pressed={state.favorited}
          className={cn(iconBtn, state.favorited && 'border-accent bg-accent/10 text-accent')}
        >
          <motion.span
            key={String(state.favorited)}
            initial={{ scale: state.favorited ? 0.4 : 1 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 12 }}
          >
            <Heart className={cn('size-5', state.favorited && 'fill-current')} />
          </motion.span>
          {format.number(favorites, { notation: 'compact' })}
          <span className="sr-only">{t('favorite')}</span>
        </motion.button>
        <button
          type="button"
          className={iconBtn}
          disabled={!loaded}
          onClick={() => guard() && setDialog('collection')}
        >
          <Bookmark
            className={cn('size-5', state.collectionIds.length && 'fill-current text-accent')}
          />
          <span className="hidden sm:inline">{t('save')}</span>
        </button>
        <button
          type="button"
          className={iconBtn}
          onClick={remix}
          disabled={remixing}
          title={t('remixHelp')}
        >
          <GitFork className={cn('size-5', remixing && 'animate-spin')} />
          <span className="hidden sm:inline">{t('remix')}</span>
        </button>
        <button type="button" className={iconBtn} onClick={() => setDialog('share')}>
          <Share2 className="size-5" />
          <span className="hidden sm:inline">{t('share')}</span>
        </button>
        {!state.isAuthor && (
          <button
            type="button"
            className={cn(iconBtn, 'text-muted hover:text-danger')}
            onClick={() =>
              guard(true) &&
              (state.reported ? toast.info(t('alreadyReported')) : setDialog('report'))
            }
            aria-label={t('report')}
            title={t('report')}
          >
            <Flag className="size-5" />
          </button>
        )}
      </div>

      {!state.isAuthor && (
        <div className="card flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
          <span className="font-bold">{state.myRating ? t('yourRating') : t('rateThis')}</span>
          <StarRating value={state.myRating} onRate={rate} disabled={!loaded} />
          <span className="text-sm text-muted">
            {rating.count
              ? t('ratingSummary', {
                  avg: format.number(rating.avg, { maximumFractionDigits: 1 }),
                  count: rating.count,
                })
              : t('noRatings')}
          </span>
        </div>
      )}

      <ChallengeDialog
        open={dialog === 'challenge'}
        onClose={() => setDialog(null)}
        quizId={quizId}
        title={title}
      />
      <ShareDialog
        open={dialog === 'share'}
        onClose={() => setDialog(null)}
        url={shareUrl}
        title={title}
      />
      {loaded && (
        <CollectionDialog
          open={dialog === 'collection'}
          onClose={() => setDialog(null)}
          quizId={quizId}
          initialSelected={state.collectionIds}
          onSelectedChange={(ids) => setState((s) => ({ ...s, collectionIds: ids }))}
        />
      )}
      <ReportDialog
        open={dialog === 'report'}
        onClose={() => setDialog(null)}
        targetType="QUIZ"
        targetId={quizId}
        onReported={() => setState((s) => ({ ...s, reported: true }))}
      />
    </div>
  );
}
