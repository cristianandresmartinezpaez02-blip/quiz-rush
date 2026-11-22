// Progreso del jugador (Fase 5): API del lado servidor compartida por la web y el tiempo real.
export { ensureCatalogs } from './catalogs';
export {
  claimMission,
  grant,
  PROGRESS_TZ,
  readStoredStats,
  recordPlay,
  recordQuizPublished,
  toUserStats,
  type PlayRecord,
  type StoredStats,
} from './engine';
export {
  activeSeason,
  addReviewItems,
  buyItem,
  claimSeasonTier,
  closeLeagueWeek,
  equipCelebration,
  ownedItemCodes,
  ProgressError,
  recordReviewAnswers,
  saveAvatar,
  type ReviewAnswer,
} from './economy';
