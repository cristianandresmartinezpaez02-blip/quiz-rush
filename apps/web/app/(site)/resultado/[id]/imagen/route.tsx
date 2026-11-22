// GET /resultado/:id/imagen → imagen del resultado para redes sociales (1200×630, PNG).
// URL estable (la usan las metaetiquetas, la página y el botón de compartir). Sin emojis ni
// fuentes externas: se genera sin pedir nada a internet. Se cachea: el resultado no cambia.
import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';
import { getShareResult } from '@/lib/share-service';

const size = { width: 1200, height: 630 };

const INK = '#1a1640';

/** Sin emojis: el generador los descargaría de internet. */
const plain = (text: string, max: number) => {
  const clean = text.replace(/[\p{Extended_Pictographic}‍️]/gu, '').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const [r, t] = await Promise.all([getShareResult((await params).id), getTranslations('share')]);
  const stats = r
    ? [
        { label: t('correct'), value: `${r.correct}/${r.total}` },
        { label: t('accuracy'), value: `${r.percent}%` },
        r.rank && r.players
          ? { label: t('position'), value: `${r.rank}º / ${r.players}` }
          : { label: t('streak'), value: `x${r.bestStreak}` },
      ]
    : [];

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 64,
        color: 'white',
        background: 'linear-gradient(135deg, #2a1065 0%, #7c3aed 55%, #ff3d9a 100%)',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 22,
            background: '#ffe14d',
            color: INK,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: 'rotate(-6deg)',
          }}
        >
          <svg width="44" height="44" viewBox="6 4 36 40">
            <path
              d="M27.5 7 13 27h9.2L19 41l16-21.5h-9.4L27.5 7Z"
              fill="#7c3aed"
              stroke={INK}
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div style={{ fontSize: 44, fontWeight: 900, letterSpacing: -1 }}>Quiz_Rush</div>
      </div>

      {r ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 34, opacity: 0.85 }}>
            {t('scored', { name: plain(r.nickname, 24) || 'Rusher' })}
          </div>
          <div style={{ fontSize: 150, fontWeight: 900, lineHeight: 1, color: '#ffe14d' }}>
            {r.score.toLocaleString('es')}
          </div>
          {r.quizTitle && (
            <div style={{ fontSize: 36, fontWeight: 700, maxWidth: 1000 }}>
              {plain(r.quizTitle, 60)}
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 72, fontWeight: 900 }}>{t('fallback')}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 20 }}>
          {stats.map((s) => (
            <div
              key={s.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                background: 'rgba(0,0,0,0.28)',
                borderRadius: 24,
                padding: '16px 28px',
              }}
            >
              <div
                style={{ fontSize: 22, opacity: 0.8, textTransform: 'uppercase', letterSpacing: 2 }}
              >
                {s.label}
              </div>
              <div style={{ fontSize: 44, fontWeight: 900 }}>{s.value}</div>
            </div>
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            background: '#ffe14d',
            color: INK,
            borderRadius: 999,
            padding: '18px 34px',
            fontSize: 30,
            fontWeight: 900,
          }}
        >
          {t('beatIt')}
        </div>
      </div>
    </div>,
    {
      ...size,
      status: r ? 200 : 404,
      headers: { 'Cache-Control': r ? 'public, max-age=86400, immutable' : 'no-store' },
    },
  );
}
