// Texto, icono y enlace de cada notificación. Lo usan la campana, la página de avisos (cliente)
// y el envío de notificaciones push (servidor), para que todos digan lo mismo.

export interface NotificationData {
  quizId?: string;
  quizTitle?: string;
  actorName?: string;
  actorUsername?: string;
  level?: number;
  code?: string;
  position?: number;
  result?: 'PROMOTED' | 'STAYED' | 'RELEGATED';
  classId?: string;
  title?: string;
  pin?: string;
  clubSlug?: string;
  clubName?: string;
}

export interface NotificationLike {
  type: string;
  data: NotificationData;
}

/** Traductor mínimo (compatible con el de next-intl en cliente y en servidor). */
export interface Translator {
  (key: string, values?: Record<string, string | number>): string;
  has(key: string): boolean;
}

export const NOTIFICATION_ICONS: Record<string, string> = {
  LEVEL_UP: '⬆️',
  ASSIGNMENT: '📝',
  QUIZ_HIDDEN: '🚫',
  ACHIEVEMENT: '🏅',
  LEAGUE_RESULT: '🏆',
  NEW_QUIZ: '✨',
  COMMENT: '💬',
  REPLY: '↩️',
  FOLLOW: '👋',
  REMIX: '🔀',
  FRIEND_REQUEST: '🤝',
  FRIEND_ACCEPTED: '🫂',
  GAME_INVITE: '🎮',
  CLUB_JOINED: '🛡️',
};

const ACTOR_TYPES = [
  'NEW_QUIZ',
  'COMMENT',
  'REPLY',
  'FOLLOW',
  'REMIX',
  'FRIEND_REQUEST',
  'FRIEND_ACCEPTED',
];

/**
 * @param t  traductor del espacio `notifications`
 * @param ta traductor del espacio `achievements`
 */
export function notificationText(t: Translator, ta: Translator, n: NotificationLike): string {
  const d = n.data;
  const actor = d.actorName ?? '—';
  switch (n.type) {
    case 'ASSIGNMENT':
      return t('types.ASSIGNMENT', { title: d.title ?? '' });
    case 'QUIZ_HIDDEN':
      return t('types.QUIZ_HIDDEN');
    case 'LEVEL_UP':
      return t('types.LEVEL_UP', { level: d.level ?? 1 });
    case 'ACHIEVEMENT':
      return d.code && ta.has(`${d.code}.name`)
        ? t('types.ACHIEVEMENT', { name: ta(`${d.code}.name`) })
        : t('types.ACHIEVEMENT', { name: '🏅' });
    case 'LEAGUE_RESULT':
      return t(`types.LEAGUE_${d.result ?? 'STAYED'}`, { position: d.position ?? 0 });
    case 'GAME_INVITE':
      return t('types.GAME_INVITE', { actor, pin: d.pin ?? '' });
    case 'CLUB_JOINED':
      return t('types.CLUB_JOINED', { actor, club: d.clubName ?? '' });
  }
  if (ACTOR_TYPES.includes(n.type)) return t(`types.${n.type}`, { actor, quiz: d.quizTitle ?? '' });
  return t.has(`types.${n.type}`) ? t(`types.${n.type}`) : n.type;
}

export function notificationHref(n: NotificationLike): string {
  const d = n.data;
  switch (n.type) {
    case 'ASSIGNMENT':
      return d.classId ? `/clases/${d.classId}` : '/clases';
    case 'QUIZ_HIDDEN':
      return '/mis-quizzes';
    case 'LEVEL_UP':
    case 'ACHIEVEMENT':
    case 'LEAGUE_RESULT':
      return '/progreso';
    case 'FOLLOW':
    case 'FRIEND_ACCEPTED':
      return d.actorUsername ? `/perfil/${d.actorUsername}` : '/amigos';
    case 'FRIEND_REQUEST':
      return '/amigos';
    case 'GAME_INVITE':
      return d.pin ? `/jugar?pin=${d.pin}` : '/jugar';
    case 'CLUB_JOINED':
      return d.clubSlug ? `/clubes/${d.clubSlug}` : '/clubes';
    case 'COMMENT':
    case 'REPLY':
      return `/quiz/${d.quizId}#comentarios`;
  }
  return d.quizId ? `/quiz/${d.quizId}` : '/notificaciones';
}
