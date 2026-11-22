import { describe, expect, it } from 'vitest';
import {
  applySurvival,
  assignTeams,
  bossMaxHp,
  bossRound,
  buildRevealExtra,
  dealPowerUps,
  fiftyFiftyHide,
  gradeAnswer,
  pairUp,
  pinCorrectness,
  powerUpBlocker,
  prepareGameQuestions,
  raceProgress,
  resolveDuels,
  seededRandom,
  smallestTeam,
  teamStandings,
  territoryGrid,
  toPublicQuestion,
  totalRounds,
  type GameQuestion,
} from '../src';

const base = {
  prompt: 'P',
  timeLimit: 20,
  points: 'NORMAL' as const,
  media: null,
  hint: null,
  explanation: null,
};
const q = (o: Partial<GameQuestion> & Pick<GameQuestion, 'type'>): GameQuestion => ({
  id: 'q',
  options: [],
  config: {},
  ...base,
  ...o,
});

describe('nuevos tipos de pregunta', () => {
  it('ordenar: crédito parcial y exige una permutación válida', () => {
    const order = q({
      type: 'ORDER',
      options: ['a', 'b', 'c'].map((id) => ({ id, text: id, isCorrect: false })),
    });
    expect(gradeAnswer(order, { qIndex: 0, order: ['a', 'b', 'c'] }).correctness).toBe(1);
    expect(gradeAnswer(order, { qIndex: 0, order: ['a', 'c', 'b'] }).correctness).toBeCloseTo(
      1 / 3,
    );
    expect(gradeAnswer(order, { qIndex: 0, order: ['a', 'a', 'b'] }).valid).toBe(false);
    expect(gradeAnswer(order, { qIndex: 0, order: ['a', 'b'] }).valid).toBe(false);
  });

  it('ordenar: la versión pública nunca llega ya ordenada', () => {
    for (const id of ['x', 'y', 'z', 'w', 'v']) {
      const order = q({
        id,
        type: 'ORDER',
        options: ['a', 'b', 'c'].map((oid) => ({ id: oid, text: oid, isCorrect: false })),
      });
      const extra = toPublicQuestion(order, 0, 1).extra;
      expect(extra?.kind === 'order' && extra.items.map((i) => i.id).join()).not.toBe('a,b,c');
    }
  });

  it('emparejar: los tokens ocultan las parejas y se corrige por pareja', () => {
    let n = 0;
    const [match] = prepareGameQuestions(
      [
        q({
          type: 'MATCH',
          config: {
            pairs: [
              { id: 'p1', left: 'España', right: 'Madrid' },
              { id: 'p2', left: 'Francia', right: 'París' },
            ],
          },
        }),
      ],
      () => `tok${++n}`,
    );
    const extra = toPublicQuestion(match!, 0, 1).extra;
    expect(extra?.kind).toBe('match');
    // Los ids del lado derecho no coinciden con los del izquierdo
    if (extra?.kind === 'match')
      expect(extra.right.map((r) => r.id).sort()).toEqual(['tok1', 'tok2']);
    expect(gradeAnswer(match!, { qIndex: 0, pairs: { p1: 'tok1', p2: 'tok2' } }).correctness).toBe(
      1,
    );
    expect(gradeAnswer(match!, { qIndex: 0, pairs: { p1: 'tok2', p2: 'tok1' } }).correctness).toBe(
      0,
    );
    expect(gradeAnswer(match!, { qIndex: 0, pairs: { p1: 'tok1' } }).correctness).toBe(0.5);
  });

  it('deslizador: cercanía, rango e histograma', () => {
    const s = q({
      type: 'SLIDER',
      config: { slider: { min: 0, max: 100, step: 1, correct: 50, tolerance: 10 } },
    });
    expect(gradeAnswer(s, { qIndex: 0, value: 50 }).correctness).toBe(1);
    expect(gradeAnswer(s, { qIndex: 0, value: 55 }).correctness).toBe(0.5);
    expect(gradeAnswer(s, { qIndex: 0, value: 150 }).valid).toBe(false);
    expect(gradeAnswer(s, { qIndex: 0, value: 99 }).distributionKeys).toEqual(['b9']);
    expect(JSON.stringify(toPublicQuestion(s, 0, 1))).not.toContain('"correct"');
  });

  it('pin: crédito completo cerca del centro y nada fuera del círculo', () => {
    const target = { x: 50, y: 50, radius: 10 };
    expect(pinCorrectness({ x: 52, y: 51 }, target)).toBe(1);
    expect(pinCorrectness({ x: 58, y: 50 }, target)).toBeGreaterThan(0);
    expect(pinCorrectness({ x: 70, y: 50 }, target)).toBe(0);
    const pin = q({ type: 'PIN', config: { pin: { imageUrl: '/a.svg', ...target } } });
    expect(JSON.stringify(toPublicQuestion(pin, 0, 1))).not.toContain('radius');
  });

  it('completar espacios: un acierto por hueco', () => {
    const f = q({
      type: 'FILL_BLANK',
      prompt: 'La capital de Francia es ___ y la de Italia ___',
      config: { blanks: [['París', 'Paris'], ['Roma']] },
    });
    expect(gradeAnswer(f, { qIndex: 0, blanks: ['paris', 'ROMA'] }).correctness).toBe(1);
    expect(gradeAnswer(f, { qIndex: 0, blanks: ['paris', 'Milán'] }).correctness).toBe(0.5);
    expect(gradeAnswer(f, { qIndex: 0, blanks: ['paris'] }).valid).toBe(false);
    const extra = toPublicQuestion(f, 0, 1).extra;
    expect(extra?.kind === 'blanks' && extra.parts).toHaveLength(3);
    expect(JSON.stringify(toPublicQuestion(f, 0, 1))).not.toContain('París');
  });

  it('nube de palabras: normaliza, limita y descarta groserías', () => {
    const c = q({ type: 'WORD_CLOUD', points: 'NONE', config: { maxWords: 2 } });
    expect(
      gradeAnswer(c, { qIndex: 0, words: ['Alegría', 'alegria', 'Paz', 'Amor'] }).distributionKeys,
    ).toEqual(['alegria', 'paz']);
    expect(gradeAnswer(c, { qIndex: 0, words: ['mierda'] }).error).toBe('OFFENSIVE');
  });

  it('pregunta abierta: rechaza texto ofensivo y ordena por votos al revelar', () => {
    const v = q({ type: 'OPEN_VOTE', points: 'NONE' });
    expect(gradeAnswer(v, { qIndex: 0, text: 'eres un pendejo' }).error).toBe('OFFENSIVE');
    const extra = buildRevealExtra(v, {
      answers: { p1: { a: { t: 'Hola' }, c: 0 }, p2: { a: { t: 'Adiós' }, c: 0 } },
      counts: {},
      players: {
        p1: { id: 'p1', nick: 'Ana', avatar: '🦊' },
        p2: { id: 'p2', nick: 'Leo', avatar: '🐼' },
      },
      votes: { p2: 3, p1: 1 },
    });
    expect(extra?.kind === 'vote' && extra.answers[0]).toMatchObject({
      text: 'Adiós',
      votes: 3,
      nick: 'Leo',
    });
  });

  it('el dibujo no revela la palabra, solo su longitud', () => {
    const d = q({ type: 'DRAW', config: { drawWords: ['jirafa'] } });
    const pub = toPublicQuestion(d, 0, 1, {
      drawer: { id: 'p1', nick: 'Ana', avatar: '🦊' },
      word: 'jirafa',
    });
    expect(JSON.stringify(pub)).not.toContain('jirafa');
    expect(pub.extra?.kind === 'draw' && pub.extra.wordLength).toBe(6);
  });
});

describe('modos de juego', () => {
  const players = Object.fromEntries(
    ['a', 'b', 'c', 'd', 'e'].map((id) => [id, { id, nick: id, avatar: '🙂' }]),
  );

  it('equipos equilibrados y puntaje medio (justo con equipos desiguales)', () => {
    const teams = assignTeams(['a', 'b', 'c', 'd', 'e'], 2, seededRandom('x'));
    const sizes = [0, 1].map((t) => Object.values(teams).filter((v) => v === t).length).sort();
    expect(sizes).toEqual([2, 3]);
    expect(smallestTeam({ a: 0, b: 0, c: 1 }, 2)).toBe(1);
    const standings = teamStandings({ a: 0, b: 1, c: 1 }, { a: 900, b: 1000, c: 0 }, players, 2);
    expect(standings[0]).toMatchObject({ index: 0, score: 900, members: 1 });
    expect(standings[1]).toMatchObject({ index: 1, score: 500 });
  });

  it('supervivencia: fallar o no responder quita una vida', () => {
    const r = applySurvival({ a: 3, b: 1, c: 0 }, { a: true });
    expect(r.lives).toEqual({ a: 3, b: 0, c: 0 });
    expect(r.eliminated).toEqual(['b']);
  });

  it('carrera y jefe', () => {
    expect(raceProgress(3, 4)).toBe(0.75);
    expect(raceProgress(9, 4)).toBe(1);
    expect(bossMaxHp(1, 1)).toBe(2000);
    expect(bossRound([1000, 500], 2)).toEqual({ damage: 900, heal: 240 });
  });

  it('torneo: emparejamientos, pase sin rival y desempate por velocidad', () => {
    const duels = pairUp(['a', 'b', 'c']);
    expect(duels).toEqual([
      { a: 'a', b: 'b', winner: null },
      { a: 'c', b: null, winner: 'c' },
    ]);
    const resolved = resolveDuels(duels, {
      a: { points: 500, ms: 3000 },
      b: { points: 500, ms: 2000 },
    });
    expect(resolved[0]!.winner).toBe('b');
    expect(
      resolveDuels([{ a: 'a', b: 'b', winner: null }], {
        a: undefined,
        b: { points: 0, ms: 9000 },
      })[0]!.winner,
    ).toBe('b');
    expect(totalRounds(8)).toBe(3);
    expect(totalRounds(9)).toBe(4);
  });

  it('territorio: casillas proporcionales al puntaje y todas asignadas', () => {
    const grid = territoryGrid([300, 100]);
    const a = grid.filter((t) => t === 0).length;
    const b = grid.filter((t) => t === 1).length;
    expect(a + b).toBe(84);
    expect(a).toBe(63);
    expect(territoryGrid([0, 0]).every((c) => c === -1)).toBe(true);
  });
});

describe('power-ups', () => {
  const mc = q({
    type: 'MULTIPLE_CHOICE',
    options: [
      { id: 'a', text: 'A', isCorrect: true },
      ...['b', 'c', 'd'].map((id) => ({ id, text: id, isCorrect: false })),
    ],
  });

  it('reparte 3 distintos', () => {
    const p = dealPowerUps(seededRandom('s'));
    expect(new Set(p).size).toBe(3);
  });

  it('50/50 nunca oculta la correcta y deja al menos una incorrecta', () => {
    for (let i = 0; i < 20; i++) {
      const hide = fiftyFiftyHide(mc.options, seededRandom(String(i)));
      expect(hide).not.toContain('a');
      expect(hide.length).toBe(2);
    }
  });

  it('solo se usan donde tienen sentido', () => {
    expect(powerUpBlocker('fifty', mc)).toBeNull();
    expect(powerUpBlocker('fifty', q({ type: 'TYPE_ANSWER' }))).toBe('POWERUP_NOT_APPLICABLE');
    expect(powerUpBlocker('hint', mc)).toBe('NO_HINT');
    expect(powerUpBlocker('double', q({ type: 'POLL', points: 'NONE' }))).toBe(
      'POWERUP_NOT_APPLICABLE',
    );
  });
});
