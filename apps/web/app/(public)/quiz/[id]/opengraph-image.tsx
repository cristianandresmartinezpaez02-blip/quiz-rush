// Imagen para redes sociales (Open Graph) generada automáticamente para cada quiz.
import { ImageResponse } from 'next/og';
import { getTheme } from '@quiz-rush/shared';
import { getPublicQuiz } from '@/lib/library-service';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Quiz_Rush';

export default async function OpenGraphImage({ params }: { params: Promise<{ id: string }> }) {
  const quiz = await getPublicQuiz((await params).id);
  const theme = getTheme(quiz?.theme);
  const title = quiz?.status === 'PUBLISHED' ? quiz.title : 'Quiz_Rush';

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
        background: `linear-gradient(140deg, ${theme.from}, ${theme.to})`,
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 40, fontWeight: 800 }}
      >
        <span style={{ fontSize: 56 }}>⚡</span> Quiz_Rush
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
        <div style={{ fontSize: 150 }}>{theme.emoji}</div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{ fontSize: title.length > 40 ? 58 : 72, fontWeight: 800, lineHeight: 1.05 }}>
            {title}
          </div>
          {quiz && (
            <div style={{ fontSize: 32, marginTop: 20, opacity: 0.9 }}>
              {`@${quiz.author.username} · ${quiz.questionCount} preguntas · ▶ ${quiz.playCount}`}
            </div>
          )}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignSelf: 'flex-start',
          background: theme.accent,
          color: '#1a1640',
          padding: '14px 32px',
          borderRadius: 24,
          fontSize: 34,
          fontWeight: 800,
        }}
      >
        ¡Juega ahora!
      </div>
    </div>,
    size,
  );
}
