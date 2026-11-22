'use client';
// Vistas de los modos de juego: equipos, supervivencia, carrera, jefe final, torneo y conquista.
// Pantalla grande (tableros), celular (indicadores) y sala de espera (selector de modo).
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import {
  LIVE_MODES,
  MODE_EMOJI,
  TEAMS,
  type GameSettings,
  type LiveMode,
  type ModeState,
  type PlayerResult,
  type PlayerSummary,
  type PodiumData,
  type TeamStanding,
} from '@quiz-rush/shared';
import { cn } from '@/lib/utils';

export const teamInfo = (index: number) => TEAMS[index % TEAMS.length]!;

/** Nombre traducido del equipo con su mascota. */
export function TeamName({ index, className }: { index: number; className?: string }) {
  const t = useTranslations('game.teams');
  const team = teamInfo(index);
  return (
    <span className={className}>
      <span aria-hidden="true">{team.mascot}</span> {t(team.id)}
    </span>
  );
}

// ───────────────────────── Pantalla grande ─────────────────────────

/** Tablero del modo (entre preguntas). null en el modo clásico. */
export function ModeBoard({ state }: { state: ModeState | null }) {
  if (!state) return null;
  switch (state.mode) {
    case 'TEAMS':
      return <TeamsBoard teams={state.teams} />;
    case 'SURVIVAL':
      return <SurvivalBanner alive={state.alive} eliminated={state.eliminatedNow} />;
    case 'RACE':
      return <RaceTrack racers={state.racers} />;
    case 'BOSS':
      return <BossBar {...state} />;
    case 'TOURNAMENT':
      return <Bracket {...state} />;
    case 'TERRITORY':
      return <TerritoryMap {...state} />;
    default:
      return null;
  }
}

function TeamsBoard({ teams }: { teams: TeamStanding[] }) {
  const t = useTranslations('game.modeViews');
  const sorted = [...teams].sort((a, b) => b.score - a.score);
  const max = Math.max(1, ...teams.map((x) => x.score));
  return (
    <ol className="mx-auto flex w-full max-w-4xl flex-col gap-3">
      {sorted.map((team, i) => {
        const info = teamInfo(team.index);
        return (
          <motion.li
            key={team.index}
            layout
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className="relative overflow-hidden rounded-3xl bg-black/30 p-4 text-white"
          >
            <motion.div
              aria-hidden="true"
              className="absolute inset-y-0 left-0 opacity-80"
              style={{ background: info.color }}
              initial={{ width: 0 }}
              animate={{ width: `${(team.score / max) * 100}%` }}
              transition={{ type: 'spring', stiffness: 80, damping: 18, delay: 0.2 + i * 0.1 }}
            />
            <div className="relative flex items-center gap-4">
              <span className="font-display text-3xl font-black">#{i + 1}</span>
              <TeamName index={team.index} className="font-display text-3xl font-extrabold" />
              <span className="text-sm font-bold opacity-90">
                {t('members', { count: team.members })}
                {team.mvps[0] && ` · ⭐ ${team.mvps[0].avatar} ${team.mvps[0].nick}`}
              </span>
              <span className="ml-auto font-display text-3xl font-black tabular-nums">
                {team.score.toLocaleString()}
              </span>
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}

function SurvivalBanner({ alive, eliminated }: { alive: number; eliminated: PlayerSummary[] }) {
  const t = useTranslations('game.modeViews');
  return (
    <div className="mx-auto flex flex-col items-center gap-3 text-center text-white">
      <p className="font-display text-4xl font-black">❤️ {t('alive', { count: alive })}</p>
      {eliminated.length > 0 && (
        <ul className="flex flex-wrap justify-center gap-2" aria-label={t('eliminatedNow')}>
          {eliminated.slice(0, 20).map((p, i) => (
            <motion.li
              key={p.id}
              initial={{ scale: 1, opacity: 1 }}
              animate={{ scale: [1, 1.15, 0.9], opacity: [1, 1, 0.55] }}
              transition={{ delay: i * 0.08, duration: 0.8 }}
              className="rounded-full bg-black/40 px-3 py-1 font-bold line-through"
            >
              💔 {p.avatar} {p.nick}
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Carrera: cada jugador avanza por su carril según sus aciertos. */
export function RaceTrack({
  racers,
}: {
  racers: (PlayerSummary & { progress: number; vehicle: string; rank: number })[];
}) {
  const shown = [...racers].sort((a, b) => a.rank - b.rank).slice(0, 10);
  return (
    <div className="mx-auto w-full max-w-5xl rounded-3xl bg-[#2b2b3a] p-3 shadow-2xl">
      <ul className="flex flex-col gap-1.5">
        {shown.map((r) => (
          <li key={r.id} className="relative flex h-12 items-center rounded-xl bg-[#3b3b4f] px-2">
            <span className="z-10 w-32 shrink-0 truncate text-sm font-bold text-white">
              {r.rank}. {r.avatar} {r.nick}
            </span>
            <div className="relative h-full flex-1 border-r-8 border-dashed border-white/80">
              {/* Líneas del carril */}
              <div
                aria-hidden="true"
                className="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-white/20"
              />
              <motion.span
                className="absolute top-1/2 -translate-y-1/2 text-3xl"
                initial={false}
                animate={{
                  left: `calc(${Math.min(1, r.progress) * 100}% - ${r.progress * 2.2}rem)`,
                }}
                transition={{ type: 'spring', stiffness: 60, damping: 14 }}
                style={{ transform: 'scaleX(-1) translateY(-50%)' }}
                aria-label={`${Math.round(r.progress * 100)}%`}
              >
                {r.vehicle}
              </motion.span>
            </div>
            <span aria-hidden="true" className="ml-2 text-2xl">
              🏁
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Jefe final: barra de vida que baja con los aciertos de toda la clase. */
export function BossBar({
  hp,
  maxHp,
  lastDamage,
  lastHeal,
  defeated,
  topHitters,
}: {
  hp: number;
  maxHp: number;
  lastDamage: number;
  lastHeal: number;
  defeated: boolean;
  topHitters: (PlayerSummary & { damage: number })[];
}) {
  const t = useTranslations('game.modeViews');
  const pct = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-4 text-white">
      <motion.span
        className="text-8xl md:text-9xl"
        aria-hidden="true"
        animate={
          defeated
            ? { rotate: [0, 20, -20, 90], scale: [1, 1.2, 0.8, 0.4], opacity: [1, 1, 1, 0.3] }
            : lastDamage > 0
              ? {
                  x: [0, -16, 16, -10, 10, 0],
                  filter: ['brightness(1)', 'brightness(2.5)', 'brightness(1)'],
                }
              : { y: [0, -10, 0] }
        }
        transition={{ duration: defeated ? 1.4 : 0.6 }}
      >
        🐉
      </motion.span>
      <div className="w-full">
        <div
          className="h-8 w-full overflow-hidden rounded-full border-4 border-white bg-black/50"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={maxHp}
          aria-valuenow={hp}
          aria-label={t('bossHp')}
        >
          <motion.div
            className="h-full rounded-full"
            style={{
              background: pct > 0.5 ? '#12a150' : pct > 0.2 ? '#fb923c' : '#e5484d',
            }}
            initial={false}
            animate={{ width: `${pct * 100}%` }}
            transition={{ type: 'spring', stiffness: 60, damping: 16 }}
          />
        </div>
        <p className="mt-2 flex justify-between font-bold">
          <span>
            {Math.round(hp).toLocaleString()} / {maxHp.toLocaleString()}
          </span>
          <span>
            {lastDamage > 0 && (
              <span className="text-[#ffe14d]">⚔️ −{lastDamage.toLocaleString()} </span>
            )}
            {lastHeal > 0 && (
              <span className="text-[#a3e635]">💚 +{lastHeal.toLocaleString()}</span>
            )}
          </span>
        </p>
      </div>
      <p className="font-display text-3xl font-black">
        {defeated ? t('bossDefeated') : t('bossAlive')}
      </p>
      {topHitters.length > 0 && (
        <ol className="flex flex-wrap justify-center gap-2" aria-label={t('topHitters')}>
          {topHitters.slice(0, 5).map((p, i) => (
            <li key={p.id} className="rounded-full bg-black/35 px-3 py-1 font-bold">
              {['🥇', '🥈', '🥉', '⚔️', '⚔️'][i]} {p.avatar} {p.nick} · {p.damage.toLocaleString()}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Jefe final en pequeño: para la pregunta y la revelación (no tapa las respuestas). */
export function BossMini({ state }: { state: ModeState | null }) {
  const t = useTranslations('game.modeViews');
  if (state?.mode !== 'BOSS') return null;
  const pct = Math.max(0, Math.min(1, state.hp / Math.max(1, state.maxHp)));
  return (
    <div className="flex items-center gap-3 rounded-full bg-black/30 py-1.5 pr-4 pl-2 text-white">
      <motion.span
        aria-hidden="true"
        className="text-3xl"
        key={state.hp}
        animate={state.lastDamage > 0 ? { x: [0, -8, 8, -4, 4, 0] } : undefined}
      >
        🐉
      </motion.span>
      <div
        className="h-4 w-40 overflow-hidden rounded-full border-2 border-white bg-black/50 md:w-64"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={state.maxHp}
        aria-valuenow={state.hp}
        aria-label={t('bossHp')}
      >
        <motion.div
          className="h-full"
          style={{ background: pct > 0.5 ? '#12a150' : pct > 0.2 ? '#fb923c' : '#e5484d' }}
          initial={false}
          animate={{ width: `${pct * 100}%` }}
        />
      </div>
      <span className="text-sm font-black tabular-nums">
        {state.lastDamage > 0 && (
          <span className="text-[#ffe14d]">−{state.lastDamage.toLocaleString()} </span>
        )}
        {state.lastHeal > 0 && (
          <span className="text-[#a3e635]">+{state.lastHeal.toLocaleString()}</span>
        )}
      </span>
    </div>
  );
}

/** Torneo: duelos de la ronda actual. */
function Bracket({
  round,
  totalRounds,
  matches,
  champion,
  remaining,
}: {
  round: number;
  totalRounds: number;
  matches: { a: PlayerSummary; b: PlayerSummary | null; winner: string | null }[];
  champion: PlayerSummary | null;
  remaining: number;
}) {
  const t = useTranslations('game.modeViews');
  if (champion) {
    return (
      <div className="mx-auto flex flex-col items-center gap-2 text-center text-white">
        <motion.span
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          className="text-9xl"
          aria-hidden="true"
        >
          {champion.avatar}
        </motion.span>
        <p className="font-display text-5xl font-black">🏆 {champion.nick}</p>
        <p className="text-xl font-bold">{t('champion')}</p>
      </div>
    );
  }
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-4 text-white">
      <p className="font-display text-3xl font-black">
        ⚔️ {t('round', { round, total: totalRounds })} · {t('remaining', { count: remaining })}
      </p>
      <ul className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {matches.slice(0, 12).map((m) => (
          <li key={m.a.id} className="flex items-center gap-2 rounded-2xl bg-black/30 p-3">
            <Duelist p={m.a} winner={m.winner} />
            <span className="font-display text-lg font-black text-[#ffe14d]">VS</span>
            {m.b ? (
              <Duelist p={m.b} winner={m.winner} />
            ) : (
              <span className="flex-1 text-center text-sm font-bold opacity-75">{t('bye')}</span>
            )}
          </li>
        ))}
      </ul>
      {matches.length > 12 && <p className="font-bold opacity-80">+{matches.length - 12}</p>}
    </div>
  );
}

function Duelist({ p, winner }: { p: PlayerSummary; winner: string | null }) {
  const lost = winner !== null && winner !== p.id;
  return (
    <span
      className={cn(
        'flex flex-1 items-center justify-center gap-1 truncate rounded-xl px-2 py-2 font-bold',
        winner === p.id && 'bg-[#12a150]',
        lost && 'line-through opacity-50',
      )}
    >
      <span aria-hidden="true">{p.avatar}</span> <span className="truncate">{p.nick}</span>
    </span>
  );
}

/** Conquista: el mapa se pinta del color de cada equipo según su puntaje. */
export function TerritoryMap({
  cols,
  rows,
  grid,
  teams,
}: {
  cols: number;
  rows: number;
  grid: number[];
  teams: TeamStanding[];
}) {
  const t = useTranslations('game.modeViews');
  const counts = teams.map((team) => grid.filter((c) => c === team.index).length);
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
      <div
        className="grid gap-1 rounded-3xl bg-black/30 p-2"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        role="img"
        aria-label={teams
          .map(
            (team, i) => `${t('cells', { count: counts[i] ?? 0 })} ${teamInfo(team.index).mascot}`,
          )
          .join(', ')}
      >
        {grid.slice(0, cols * rows).map((owner, i) => (
          <motion.span
            key={i}
            className="aspect-square rounded-md"
            initial={false}
            animate={{
              backgroundColor: owner >= 0 ? teamInfo(owner).color : 'rgba(255,255,255,.12)',
            }}
            transition={{ delay: (i % cols) * 0.02 + Math.floor(i / cols) * 0.03, duration: 0.4 }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap justify-center gap-3 text-white">
        {teams.map((team, i) => (
          <li
            key={team.index}
            className="flex items-center gap-2 rounded-full bg-black/30 px-4 py-1.5 font-bold"
          >
            <span className="size-4 rounded" style={{ background: teamInfo(team.index).color }} />
            <TeamName index={team.index} /> · {t('cells', { count: counts[i] ?? 0 })}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Pancarta del ganador según el modo (encima del podio). */
export function PodiumModeBanner({ podium }: { podium: PodiumData }) {
  const t = useTranslations('game.modeViews');
  const s = podium.modeState;
  if (!s) return null;
  let content: React.ReactNode = null;
  if (s.mode === 'TEAMS' || s.mode === 'TERRITORY') {
    const best = [...s.teams].sort((a, b) => b.score - a.score)[0];
    if (best) {
      content = (
        <>
          🏆 <TeamName index={best.index} /> · {t('teamWins')}
        </>
      );
    }
  } else if (s.mode === 'BOSS')
    content = s.defeated ? `🐉💥 ${t('bossDefeated')}` : `🐉 ${t('bossEscaped')}`;
  else if (s.mode === 'TOURNAMENT' && s.champion)
    content = `⚔️ ${t('championIs', { nick: s.champion.nick })}`;
  else if (s.mode === 'SURVIVAL') content = `❤️ ${t('survivors', { count: s.alive })}`;
  if (!content) return null;
  return (
    <motion.p
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.3 }}
      className="rounded-full bg-black/35 px-6 py-2 font-display text-2xl font-black text-white md:text-3xl"
    >
      {content}
    </motion.p>
  );
}

// ───────────────────────── Celular ─────────────────────────

/** Indicadores del modo para el jugador: equipo, vidas, rival, vehículo. */
export function PlayerModeHud({
  mode,
  me,
  opponent,
}: {
  mode: LiveMode;
  me: { team: number | null; lives: number | null; eliminated: boolean; vehicle: string | null };
  opponent: PlayerSummary | null;
}) {
  const t = useTranslations('game.modeViews');
  if (mode === 'CLASSIC') return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-sm font-bold">
      {me.team !== null && (
        <span
          className="rounded-full px-3 py-1 text-[#1a1640]"
          style={{ background: teamInfo(me.team).color }}
        >
          <TeamName index={me.team} />
        </span>
      )}
      {mode === 'SURVIVAL' && me.lives !== null && (
        <Hearts lives={me.lives} max={Math.max(me.lives, 3)} />
      )}
      {mode === 'RACE' && me.vehicle && (
        <span className="rounded-full bg-black/30 px-3 py-1">
          {me.vehicle} {t('yourVehicle')}
        </span>
      )}
      {mode === 'TOURNAMENT' && !me.eliminated && opponent && (
        <span className="rounded-full bg-black/30 px-3 py-1">
          ⚔️ {t('vs', { nick: `${opponent.avatar} ${opponent.nick}` })}
        </span>
      )}
      {mode === 'BOSS' && (
        <span className="rounded-full bg-black/30 px-3 py-1">🐉 {t('bossHint')}</span>
      )}
    </div>
  );
}

export function Hearts({ lives, max }: { lives: number; max: number }) {
  const t = useTranslations('game.modeViews');
  return (
    <span
      className="flex gap-0.5 rounded-full bg-black/30 px-3 py-1"
      role="img"
      aria-label={t('lives', { count: lives })}
    >
      {Array.from({ length: max }, (_, i) => (
        <motion.span
          key={i}
          initial={false}
          animate={i < lives ? { scale: 1, opacity: 1 } : { scale: 0.8, opacity: 0.35 }}
          aria-hidden="true"
        >
          {i < lives ? '❤️' : '🖤'}
        </motion.span>
      ))}
    </span>
  );
}

/** Pantalla del jugador eliminado (supervivencia o torneo): sigue viendo la partida. */
export function EliminatedView({ mode }: { mode: LiveMode }) {
  const t = useTranslations('game.modeViews');
  return (
    <div className="m-auto flex max-w-xs flex-col items-center gap-3 text-center">
      <span className="text-7xl" aria-hidden="true">
        {mode === 'TOURNAMENT' ? '🥲' : '💔'}
      </span>
      <h1 className="font-display text-3xl font-extrabold">{t('youAreOut')}</h1>
      <p className="opacity-90">{t('keepWatching')}</p>
    </div>
  );
}

/** Información del modo en el resultado de cada pregunta. */
export function ModeResultInfo({ result }: { result: PlayerResult }) {
  const t = useTranslations('game.modeViews');
  const items: React.ReactNode[] = [];
  if (result.lives !== undefined)
    items.push(<Hearts key="l" lives={result.lives} max={Math.max(3, result.lives)} />);
  if (result.team) {
    items.push(
      <span
        key="t"
        className="rounded-full px-3 py-1 text-[#1a1640]"
        style={{ background: teamInfo(result.team.index).color }}
      >
        <TeamName index={result.team.index} /> · #{result.team.rank}
      </span>,
    );
  }
  if (result.raceProgress !== undefined) {
    items.push(
      <span key="r" className="rounded-full bg-black/30 px-3 py-1">
        🏁 {Math.round(result.raceProgress * 100)}%
      </span>,
    );
  }
  if (result.damage) {
    items.push(
      <span key="d" className="rounded-full bg-black/30 px-3 py-1">
        ⚔️ {t('damage', { points: result.damage.toLocaleString() })}
      </span>,
    );
  }
  if (result.duel?.next) {
    items.push(
      <span key="n" className="rounded-full bg-black/30 px-3 py-1">
        ⚔️ {t('nextRival', { nick: result.duel.next.nick })}
      </span>,
    );
  }
  if (result.shieldUsed)
    items.push(
      <span key="s" className="rounded-full bg-black/30 px-3 py-1">
        🛡️ {t('shieldSaved')}
      </span>,
    );
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-sm font-bold">
      {items}
    </div>
  );
}

// ───────────────────────── Sala de espera ─────────────────────────

/** Selector del modo de juego y sus opciones (solo el anfitrión, antes de empezar). */
export function ModePicker({
  settings,
  onChange,
}: {
  settings: GameSettings;
  onChange: (patch: Partial<GameSettings>) => void;
}) {
  const t = useTranslations('game.modes');
  const tv = useTranslations('game.modeViews');
  const mode = settings.mode;
  return (
    <div className="flex flex-col gap-3 rounded-3xl bg-black/30 p-4 text-white">
      <p className="font-display text-xl font-extrabold">{tv('chooseMode')}</p>
      <div
        className="grid grid-cols-2 gap-2 md:grid-cols-4"
        role="radiogroup"
        aria-label={tv('chooseMode')}
      >
        {LIVE_MODES.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => onChange({ mode: m })}
            className={cn(
              'flex cursor-pointer flex-col items-start gap-0.5 rounded-2xl p-3 text-left transition-colors',
              mode === m ? 'bg-white text-[#1a1640] shadow-lg' : 'bg-white/10 hover:bg-white/20',
            )}
          >
            <span className="text-2xl" aria-hidden="true">
              {MODE_EMOJI[m]}
            </span>
            <span className="font-display font-extrabold">{t(`${m}.name`)}</span>
            <span className="text-xs opacity-80">{t(`${m}.desc`)}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-bold">
        {(mode === 'TEAMS' || mode === 'TERRITORY') && (
          <label className="flex items-center gap-2">
            {tv('teamCount')}
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={settings.teamCount === n}
                onClick={() => onChange({ teamCount: n })}
                className={cn(
                  'grid size-9 cursor-pointer place-items-center rounded-xl',
                  settings.teamCount === n ? 'bg-white text-[#1a1640]' : 'bg-white/15',
                )}
              >
                {n}
              </button>
            ))}
          </label>
        )}
        {mode === 'TEAMS' && (
          <label className="flex items-center gap-2">
            {tv('talkTime')}
            <select
              value={settings.teamTalkSeconds}
              onChange={(e) => onChange({ teamTalkSeconds: Number(e.target.value) })}
              className="rounded-xl bg-white px-2 py-1.5 text-[#1a1640]"
            >
              {[0, 5, 10, 15, 20, 30].map((s) => (
                <option key={s} value={s}>
                  {s}s
                </option>
              ))}
            </select>
          </label>
        )}
        {mode === 'SURVIVAL' && (
          <label className="flex items-center gap-2">
            {tv('livesSetting')}
            {[1, 2, 3, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={settings.lives === n}
                onClick={() => onChange({ lives: n })}
                className={cn(
                  'cursor-pointer rounded-xl px-2.5 py-1.5',
                  settings.lives === n ? 'bg-white text-[#1a1640]' : 'bg-white/15',
                )}
              >
                {'❤️'.repeat(Math.min(n, 3))}
                {n > 3 ? `×${n}` : ''}
              </button>
            ))}
          </label>
        )}
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={settings.powerUps}
            onChange={(e) => onChange({ powerUps: e.target.checked })}
            className="size-5 accent-[#ffe14d]"
          />
          ⚡ {tv('powerUps')}
        </label>
      </div>
    </div>
  );
}
