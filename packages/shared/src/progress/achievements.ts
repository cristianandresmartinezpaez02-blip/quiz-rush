// Logros. Cada uno mide una estadística del jugador y se desbloquea al llegar al umbral.
// El nombre y la descripción se traducen en messages/*.json → achievements.<code>.

/** Estadísticas acumuladas que miden los logros. */
export interface UserStats {
  games: number;
  correct: number;
  bestStreak: number;
  wins: number;
  perfect: number;
  dailyStreak: number;
  level: number;
  quizzes: number;
  followers: number;
  duelWins: number;
  rushBest: number;
  adventureStars: number;
  reviews: number;
  /** Modos distintos jugados */
  modes: number;
  dailyPlayed: number;
  /** Partidas jugadas de madrugada (0–5 h) */
  nightGames: number;
}

export type StatKey = keyof UserStats;

export const EMPTY_STATS: UserStats = {
  games: 0,
  correct: 0,
  bestStreak: 0,
  wins: 0,
  perfect: 0,
  dailyStreak: 0,
  level: 1,
  quizzes: 0,
  followers: 0,
  duelWins: 0,
  rushBest: 0,
  adventureStars: 0,
  reviews: 0,
  modes: 0,
  dailyPlayed: 0,
  nightGames: 0,
};

export type AchievementCategory =
  'play' | 'skill' | 'streak' | 'creator' | 'social' | 'modes' | 'secret';

export interface AchievementDef {
  code: string;
  icon: string;
  category: AchievementCategory;
  metric: StatKey;
  threshold: number;
  rewardXp: number;
  rewardCoins: number;
  secret?: boolean;
}

const a = (
  code: string,
  icon: string,
  category: AchievementCategory,
  metric: StatKey,
  threshold: number,
  rewardXp: number,
  rewardCoins: number,
  secret = false,
): AchievementDef => ({ code, icon, category, metric, threshold, rewardXp, rewardCoins, secret });

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  // Jugar
  a('first_game', '🎮', 'play', 'games', 1, 20, 10),
  a('games_10', '🕹️', 'play', 'games', 10, 50, 25),
  a('games_50', '🏟️', 'play', 'games', 50, 150, 75),
  a('games_200', '🌌', 'play', 'games', 200, 400, 200),
  a('level_5', '⭐', 'play', 'level', 5, 0, 25),
  a('level_10', '🌟', 'play', 'level', 10, 0, 50),
  a('level_25', '💫', 'play', 'level', 25, 0, 150),
  a('level_50', '👑', 'play', 'level', 50, 0, 500),
  // Habilidad
  a('correct_50', '✅', 'skill', 'correct', 50, 40, 20),
  a('correct_250', '🧠', 'skill', 'correct', 250, 120, 60),
  a('correct_1000', '🦉', 'skill', 'correct', 1000, 400, 200),
  a('perfect_1', '💯', 'skill', 'perfect', 1, 50, 25),
  a('perfect_10', '🎯', 'skill', 'perfect', 10, 200, 100),
  a('win_1', '🥇', 'skill', 'wins', 1, 50, 25),
  a('wins_10', '🏆', 'skill', 'wins', 10, 150, 75),
  a('wins_50', '🦁', 'skill', 'wins', 50, 400, 200),
  // Rachas
  a('streak_5', '🔥', 'streak', 'bestStreak', 5, 40, 20),
  a('streak_10', '☄️', 'streak', 'bestStreak', 10, 100, 50),
  a('streak_20', '🌋', 'streak', 'bestStreak', 20, 250, 125),
  a('daily_3', '📅', 'streak', 'dailyStreak', 3, 30, 15),
  a('daily_7', '🗓️', 'streak', 'dailyStreak', 7, 100, 50),
  a('daily_30', '🏅', 'streak', 'dailyStreak', 30, 500, 250),
  // Creador
  a('creator_1', '✏️', 'creator', 'quizzes', 1, 50, 25),
  a('creator_5', '📝', 'creator', 'quizzes', 5, 150, 75),
  a('creator_20', '📚', 'creator', 'quizzes', 20, 400, 200),
  // Social
  a('followers_10', '🤝', 'social', 'followers', 10, 100, 50),
  a('followers_100', '📣', 'social', 'followers', 100, 400, 200),
  // Modos
  a('duel_1', '⚔️', 'modes', 'duelWins', 1, 40, 20),
  a('duel_25', '🗡️', 'modes', 'duelWins', 25, 250, 125),
  a('rush_20', '⚡', 'modes', 'rushBest', 20, 80, 40),
  a('rush_40', '🚀', 'modes', 'rushBest', 40, 250, 125),
  a('adventure_15', '🗺️', 'modes', 'adventureStars', 15, 100, 50),
  a('adventure_60', '🏰', 'modes', 'adventureStars', 60, 400, 200),
  a('review_50', '🔁', 'modes', 'reviews', 50, 100, 50),
  a('daily_challenge_10', '☀️', 'modes', 'dailyPlayed', 10, 100, 50),
  // Secretos
  a('night_owl', '🌙', 'secret', 'nightGames', 1, 30, 30, true),
  a('explorer', '🧭', 'secret', 'modes', 5, 80, 60, true),
];

/** Logros que se desbloquean con estas estadísticas y aún no se tenían. */
export function newlyUnlocked(stats: UserStats, unlocked: ReadonlySet<string>): AchievementDef[] {
  return ACHIEVEMENTS.filter((d) => !unlocked.has(d.code) && stats[d.metric] >= d.threshold);
}

/** Progreso (0..1) hacia un logro. */
export function achievementProgress(def: AchievementDef, stats: UserStats): number {
  return Math.min(1, stats[def.metric] / def.threshold);
}
