// Informes como tabla (para descargarlos en CSV o Excel).
import 'server-only';
import type { assignmentReport, gameReport } from './class-service';

type AssignmentReport = Awaited<ReturnType<typeof assignmentReport>>;
type GameReport = Awaited<ReturnType<typeof gameReport>>;

const L = {
  es: {
    student: 'Estudiante',
    username: 'Usuario',
    attempts: 'Intentos',
    percent: '% aciertos',
    score: 'Puntaje',
    passed: 'Aprobado',
    finished: 'Fecha',
    yes: 'Sí',
    no: 'No',
    pending: 'Sin entregar',
    question: 'Pregunta',
    answered: 'Respuestas',
    accuracy: '% acierto',
    avgTime: 'Tiempo medio (s)',
    rank: 'Puesto',
    player: 'Jugador',
    team: 'Equipo',
    correct: 'Aciertos',
    streak: 'Mejor racha',
  },
  en: {
    student: 'Student',
    username: 'Username',
    attempts: 'Attempts',
    percent: '% correct',
    score: 'Score',
    passed: 'Passed',
    finished: 'Date',
    yes: 'Yes',
    no: 'No',
    pending: 'Not submitted',
    question: 'Question',
    answered: 'Answers',
    accuracy: '% correct',
    avgTime: 'Average time (s)',
    rank: 'Rank',
    player: 'Player',
    team: 'Team',
    correct: 'Correct',
    streak: 'Best streak',
  },
};

const questionRows = (qs: AssignmentReport['questions'], t: (typeof L)['es']) => [
  [],
  [t.question, t.answered, t.accuracy, t.avgTime],
  ...qs.map((q) => [q.prompt, String(q.answered), String(q.accuracy), (q.avgMs / 1000).toFixed(1)]),
];

export function assignmentReportRows(r: AssignmentReport, lang: 'es' | 'en'): string[][] {
  const t = L[lang];
  return [
    [t.student, t.username, t.attempts, t.percent, t.score, t.passed, t.finished],
    ...r.students.map((s) =>
      s.best
        ? [
            s.displayName,
            s.username,
            String(s.attempts),
            String(s.best.percent),
            String(s.best.score),
            s.passed ? t.yes : t.no,
            s.best.endedAt?.slice(0, 10) ?? '',
          ]
        : [s.displayName, s.username, '0', '', '', t.pending, ''],
    ),
    ...questionRows(r.questions, t),
  ];
}

export function gameReportRows(r: GameReport, lang: 'es' | 'en'): string[][] {
  const t = L[lang];
  return [
    [t.rank, t.player, t.team, t.score, t.correct, t.percent, t.streak],
    ...r.players.map((p) => [
      String(p.rank),
      p.nickname,
      p.team?.name ?? '',
      String(p.score),
      String(p.correctCount),
      String(p.percent),
      String(p.bestStreak),
    ]),
    ...questionRows(r.questions, t),
  ];
}
