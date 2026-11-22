// Plantillas para empezar un quiz: estructuras útiles para clase, reuniones o fiestas.
// El nombre y la descripción visibles se traducen en messages/*.json → templates.<id>.
import { createOption, createQuestion, createEmptyQuiz } from '../questions/defaults';
import type { QuestionDoc, QuizDoc } from '../questions/schemas';
import { newId } from '../ids';

export const QUIZ_TEMPLATES = [
  { id: 'review', emoji: '📚', theme: 'space', category: 'general' },
  { id: 'icebreaker', emoji: '🧊', theme: 'candy', category: 'other' },
  { id: 'poll', emoji: '📊', theme: 'ocean', category: 'other' },
  { id: 'exam', emoji: '📝', theme: 'arctic', category: 'general' },
  { id: 'birthday', emoji: '🎂', theme: 'candy', category: 'other' },
  { id: 'feedback', emoji: '💬', theme: 'jungle', category: 'other' },
] as const;
export type TemplateId = (typeof QUIZ_TEMPLATES)[number]['id'];
export const TEMPLATE_IDS = QUIZ_TEMPLATES.map((t) => t.id) as TemplateId[];

type L = 'es' | 'en';
const tr = (lang: L, es: string, en: string) => (lang === 'en' ? en : es);

function mc(lang: L, prompt: string, options: string[], correct: number, time = 20): QuestionDoc {
  const q = createQuestion('MULTIPLE_CHOICE', lang);
  q.prompt = prompt;
  q.timeLimit = time;
  q.options = options.map((o, i) => createOption(o, i === correct));
  return q;
}

function poll(lang: L, prompt: string, options: string[]): QuestionDoc {
  const q = createQuestion('POLL', lang);
  q.prompt = prompt;
  q.options = options.map((o) => createOption(o));
  return q;
}

function blank(lang: L, type: Parameters<typeof createQuestion>[0], prompt: string): QuestionDoc {
  const q = createQuestion(type, lang);
  q.prompt = prompt;
  return q;
}

/**
 * Documento de la plantilla. Las preguntas tienen huecos marcados "…" para que el autor los
 * complete; el editor muestra qué falta antes de publicar.
 */
export function templateDoc(id: TemplateId, lang: L): QuizDoc {
  const meta = QUIZ_TEMPLATES.find((t) => t.id === id)!;
  const base: QuizDoc = { ...createEmptyQuiz(lang), theme: meta.theme, category: meta.category };
  const questions: QuestionDoc[] = [];

  switch (id) {
    case 'review':
      base.title = tr(lang, 'Repaso: (tema)', 'Review: (topic)');
      questions.push(
        mc(
          lang,
          tr(
            lang,
            '¿Cuál es la idea principal de la clase?',
            'What is the main idea of the lesson?',
          ),
          ['…', '…', '…', '…'],
          0,
        ),
        blank(
          lang,
          'TRUE_FALSE',
          tr(
            lang,
            'Afirmación sobre el tema (verdadera o falsa)',
            'A statement about the topic (true or false)',
          ),
        ),
        blank(
          lang,
          'TYPE_ANSWER',
          tr(lang, 'Define el concepto clave en una palabra', 'Name the key concept in one word'),
        ),
        blank(
          lang,
          'ORDER',
          tr(lang, 'Ordena los pasos del proceso', 'Put the steps of the process in order'),
        ),
        blank(
          lang,
          'WORD_CLOUD',
          tr(lang, '¿Qué te quedó más claro hoy?', 'What was clearest to you today?'),
        ),
      );
      break;
    case 'icebreaker':
      base.title = tr(lang, 'Rompehielos: conozcámonos', 'Icebreaker: get to know each other');
      questions.push(
        poll(lang, tr(lang, '¿Playa o montaña?', 'Beach or mountains?'), [
          tr(lang, 'Playa 🏖️', 'Beach 🏖️'),
          tr(lang, 'Montaña 🏔️', 'Mountains 🏔️'),
        ]),
        poll(lang, tr(lang, '¿Cuál es tu superpoder ideal?', 'Pick your ideal superpower'), [
          tr(lang, 'Volar', 'Flying'),
          tr(lang, 'Invisibilidad', 'Invisibility'),
          tr(lang, 'Teletransporte', 'Teleportation'),
          tr(lang, 'Leer mentes', 'Mind reading'),
        ]),
        blank(
          lang,
          'WORD_CLOUD',
          tr(
            lang,
            'Describe tu fin de semana con una palabra',
            'Describe your weekend in one word',
          ),
        ),
        blank(
          lang,
          'OPEN_VOTE',
          tr(lang, 'Cuenta un dato curioso sobre ti', 'Share a fun fact about yourself'),
        ),
      );
      break;
    case 'poll':
      base.title = tr(lang, 'Encuesta rápida', 'Quick poll');
      questions.push(
        poll(lang, tr(lang, '¿Qué te pareció la sesión?', 'How was the session?'), [
          '😍',
          '🙂',
          '😐',
          '🙁',
        ]),
        poll(lang, tr(lang, '¿Qué tema quieres ver después?', 'What topic should we cover next?'), [
          '…',
          '…',
          '…',
        ]),
        blank(
          lang,
          'WORD_CLOUD',
          tr(lang, 'Una palabra para resumir hoy', 'One word to sum up today'),
        ),
      );
      break;
    case 'exam':
      base.title = tr(lang, 'Evaluación: (tema)', 'Assessment: (topic)');
      base.difficulty = 'HARD';
      for (let i = 0; i < 4; i++) {
        questions.push(
          mc(lang, tr(lang, `Pregunta ${i + 1}`, `Question ${i + 1}`), ['…', '…', '…', '…'], 0, 30),
        );
      }
      questions.push(
        blank(lang, 'FILL_BLANK', tr(lang, 'Completa: ___ es …', 'Fill in: ___ is …')),
      );
      questions.push(blank(lang, 'SLIDER', tr(lang, '¿En qué año…?', 'In which year…?')));
      break;
    case 'birthday': {
      base.title = tr(lang, '¿Cuánto conoces a (nombre)?', 'How well do you know (name)?');
      questions.push(
        mc(
          lang,
          tr(lang, '¿Cuál es su comida favorita?', 'What is their favourite food?'),
          ['…', '…', '…', '…'],
          0,
        ),
        mc(lang, tr(lang, '¿Dónde nació?', 'Where were they born?'), ['…', '…', '…', '…'], 0),
        blank(
          lang,
          'TRUE_FALSE',
          tr(lang, 'Alguna vez se subió a un avión', 'They have been on a plane'),
        ),
        blank(
          lang,
          'OPEN_VOTE',
          tr(lang, 'Escribe tu mejor deseo de cumpleaños', 'Write your best birthday wish'),
        ),
      );
      break;
    }
    case 'feedback': {
      base.title = tr(lang, 'Tu opinión cuenta', 'Your feedback matters');
      const scale = createQuestion('SLIDER', lang);
      scale.prompt = tr(
        lang,
        'Del 1 al 10, ¿cuánto recomendarías esta actividad?',
        'From 1 to 10, how likely are you to recommend this?',
      );
      scale.points = 'NONE';
      scale.config = { slider: { min: 1, max: 10, step: 1, correct: 10, tolerance: 9 } };
      questions.push(
        scale,
        poll(lang, tr(lang, '¿Qué fue lo mejor?', 'What was the best part?'), ['…', '…', '…']),
        blank(lang, 'OPEN_VOTE', tr(lang, '¿Qué mejorarías?', 'What would you improve?')),
      );
      break;
    }
  }
  return { ...base, questions: questions.map((q) => ({ ...q, id: newId() })) };
}
