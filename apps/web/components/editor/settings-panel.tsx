'use client';
// Panel derecho: ajustes de la pregunta seleccionada y del quiz completo.
import { ImagePlus, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type KeyboardEvent } from 'react';
import {
  CATEGORIES,
  DIFFICULTIES,
  estimateDurationSeconds,
  LANGUAGES,
  LIMITS,
  MUSIC_TRACKS,
  POINTS_MODES,
  QUESTION_TYPE_EMOJI,
  UNSCORED_TYPES,
  QUIZ_THEMES,
} from '@quiz-rush/shared';
import { Field, Select, Switch, Textarea } from '@/components/ui/field';
import { useEditorStore, useSelectedQuestion } from '@/stores/editor-store';
import { cn } from '@/lib/utils';
import { MediaPicker } from './media';
import { WriteExplanation } from './ai-assist';
import { TypePicker } from './type-picker';

const TIME_PRESETS = [5, 10, 20, 30, 45, 60, 90, 120, 240];

export function SettingsPanel({
  remixOf,
}: {
  remixOf: { id: string; title: string; username: string } | null;
}) {
  const t = useTranslations('editor');
  const [tab, setTab] = useState<'question' | 'quiz'>('question');

  return (
    <aside
      aria-label={t('settings')}
      className="flex flex-col border-t-2 border-line bg-surface lg:min-h-0 lg:border-t-0 lg:border-l-2"
    >
      <div role="tablist" className="flex border-b-2 border-line p-2">
        {(['question', 'quiz'] as const).map((key) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'flex-1 cursor-pointer rounded-xl py-2 text-sm font-extrabold transition-colors',
              tab === key ? 'bg-accent text-accent-ink' : 'text-muted hover:bg-surface-2',
            )}
          >
            {key === 'question' ? t('questionTab') : t('quizTab')}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="p-4 lg:flex-1 lg:overflow-y-auto">
        {remixOf && (
          <p className="mb-4 rounded-xl bg-accent/10 p-3 text-xs font-semibold">
            🔀 {t('remixCredit')}{' '}
            <a href={`/quiz/${remixOf.id}`} className="font-extrabold text-accent hover:underline">
              {remixOf.title}
            </a>{' '}
            · @{remixOf.username}
          </p>
        )}
        {tab === 'question' ? <QuestionSettings /> : <QuizSettingsForm />}
      </div>
    </aside>
  );
}

function QuestionSettings() {
  const t = useTranslations('editor');
  const tq = useTranslations('questionTypes');
  const question = useSelectedQuestion();
  const update = useEditorStore((s) => s.updateQuestion);
  const changeType = useEditorStore((s) => s.changeType);
  const [typeOpen, setTypeOpen] = useState(false);

  if (!question) return <p className="text-sm text-muted">{t('noQuestionSelected')}</p>;
  const set = (recipe: Parameters<typeof update>[1]) => update(question.id, recipe);
  const language = useEditorStore.getState().doc.language;
  const unscored = UNSCORED_TYPES.includes(question.type);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="mb-1.5 text-sm font-bold">{t('type')}</p>
        <button
          type="button"
          onClick={() => setTypeOpen(true)}
          className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border-2 border-line bg-surface-2 px-4 py-3 text-left font-bold hover:border-accent"
        >
          <span className="text-2xl" aria-hidden="true">
            {QUESTION_TYPE_EMOJI[question.type]}
          </span>
          {tq(question.type)}
        </button>
        <TypePicker
          open={typeOpen}
          current={question.type}
          onClose={() => setTypeOpen(false)}
          onPick={(type) => {
            changeType(question.id, type);
            setTypeOpen(false);
          }}
        />
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-bold">{t('timeLimit')}</legend>
        <div className="grid grid-cols-5 gap-1.5">
          {TIME_PRESETS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={question.timeLimit === s}
              onClick={() => set((q) => void (q.timeLimit = s))}
              className={cn(
                'cursor-pointer rounded-xl border-2 py-1.5 text-sm font-bold',
                question.timeLimit === s
                  ? 'border-accent bg-accent text-accent-ink'
                  : 'border-line hover:border-accent/60',
              )}
            >
              {s}s
            </button>
          ))}
          <input
            type="number"
            min={LIMITS.timeLimit.min}
            max={LIMITS.timeLimit.max}
            value={question.timeLimit}
            aria-label={t('timeLimit')}
            onChange={(e) => {
              const v = Math.round(Number(e.target.value));
              if (Number.isFinite(v)) {
                set(
                  (q) =>
                    void (q.timeLimit = Math.min(
                      LIMITS.timeLimit.max,
                      Math.max(LIMITS.timeLimit.min, v),
                    )),
                );
              }
            }}
            className="rounded-xl border-2 border-line bg-surface px-1 text-center text-sm font-bold outline-none focus:border-accent"
          />
        </div>
      </fieldset>

      {!unscored && (
        <fieldset>
          <legend className="mb-1.5 text-sm font-bold">{t('points')}</legend>
          <div className="grid grid-cols-3 gap-1 rounded-2xl bg-surface-2 p-1">
            {POINTS_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={question.points === mode}
                onClick={() => set((q) => void (q.points = mode))}
                className={cn(
                  'cursor-pointer rounded-xl py-2 text-xs font-extrabold',
                  question.points === mode
                    ? 'bg-primary text-primary-ink shadow'
                    : 'text-muted hover:text-fg',
                )}
              >
                {t(`pointsModes.${mode}`)}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {['MULTIPLE_CHOICE', 'AUDIO', 'REVEAL_IMAGE'].includes(question.type) && (
        <Switch
          checked={!!question.config.multiSelect}
          onChange={(checked) =>
            set((q) => {
              q.config.multiSelect = checked;
              // Al desactivar, deja solo la primera correcta
              if (!checked) {
                let seen = false;
                for (const o of q.options) {
                  if (o.isCorrect && seen) o.isCorrect = false;
                  if (o.isCorrect) seen = true;
                }
              }
            })
          }
          label={t('multiSelect')}
        />
      )}

      {unscored && (
        <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">
          {question.type === 'POLL' ? t('pollHelp') : t('types.unscoredHelp')}
        </p>
      )}

      <Field label={t('hint')}>
        {(p) => (
          <Textarea
            {...p}
            className="min-h-16"
            value={question.hint ?? ''}
            maxLength={LIMITS.hint.max}
            placeholder={t('hintPlaceholder')}
            onChange={(e) => set((q) => void (q.hint = e.target.value || null))}
          />
        )}
      </Field>
      {!unscored && (
        <div className="-mb-3 flex justify-end">
          <WriteExplanation question={question} language={language} />
        </div>
      )}
      {!unscored && (
        <Field label={t('explanation')}>
          {(p) => (
            <Textarea
              {...p}
              value={question.explanation ?? ''}
              maxLength={LIMITS.explanation.max}
              placeholder={t('explanationPlaceholder')}
              onChange={(e) => set((q) => void (q.explanation = e.target.value || null))}
            />
          )}
        </Field>
      )}
    </div>
  );
}

function QuizSettingsForm() {
  const t = useTranslations('editor');
  const tc = useTranslations('categories');
  const tt = useTranslations('themes');
  const tl = useTranslations('languages');
  const doc = useEditorStore((s) => s.doc);
  const updateSettings = useEditorStore((s) => s.updateSettings);
  const [coverOpen, setCoverOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState('');

  function addTag(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' && e.key !== ',') return;
    e.preventDefault();
    const tag = tagDraft.trim().toLowerCase().slice(0, 30);
    if (tag && !doc.tags.includes(tag) && doc.tags.length < 10)
      updateSettings({ tags: [...doc.tags, tag] });
    setTagDraft('');
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="mb-1.5 text-sm font-bold">{t('cover')}</p>
        {doc.coverUrl ? (
          <div className="group relative overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={doc.coverUrl} alt="" className="aspect-video w-full object-cover" />
            <button
              type="button"
              onClick={() => updateSettings({ coverUrl: null })}
              aria-label={t('removeMedia')}
              className="absolute top-2 right-2 grid size-9 cursor-pointer place-items-center rounded-xl bg-black/60 text-white"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCoverOpen(true)}
            className="flex aspect-video w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line text-muted hover:border-accent"
          >
            <ImagePlus className="size-7" />
            <span className="text-sm font-bold">{t('changeCover')}</span>
          </button>
        )}
        <MediaPicker
          open={coverOpen}
          accept="image/*"
          onClose={() => setCoverOpen(false)}
          onPick={(m) =>
            (m.kind === 'image' || m.kind === 'gif') && updateSettings({ coverUrl: m.url })
          }
        />
      </div>

      <Field label={t('description')}>
        {(p) => (
          <Textarea
            {...p}
            value={doc.description ?? ''}
            maxLength={LIMITS.quizDescription.max}
            placeholder={t('descriptionPlaceholder')}
            onChange={(e) => updateSettings({ description: e.target.value })}
          />
        )}
      </Field>

      <Field label={t('category')}>
        {(p) => (
          <Select
            {...p}
            value={doc.category ?? ''}
            onChange={(e) => updateSettings({ category: e.target.value || null })}
          >
            <option value="">{t('chooseCategory')}</option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {tc(c.id)}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t('language')}>
          {(p) => (
            <Select
              {...p}
              value={doc.language}
              onChange={(e) =>
                updateSettings({ language: e.target.value as (typeof LANGUAGES)[number] })
              }
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {tl(l)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('difficulty')}>
          {(p) => (
            <Select
              {...p}
              value={doc.difficulty}
              onChange={(e) =>
                updateSettings({ difficulty: e.target.value as (typeof DIFFICULTIES)[number] })
              }
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {t(`difficulties.${d}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-bold">{t('visualTheme')}</legend>
        <div className="grid grid-cols-4 gap-2">
          {QUIZ_THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              aria-pressed={doc.theme === theme.id}
              onClick={() => updateSettings({ theme: theme.id })}
              title={tt(theme.id)}
              className={cn(
                'flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 p-1.5 transition-transform hover:-translate-y-0.5',
                doc.theme === theme.id ? 'border-accent' : 'border-transparent',
              )}
            >
              <span
                className="grid aspect-square w-full place-items-center rounded-xl text-xl"
                style={{ background: `linear-gradient(140deg, ${theme.from}, ${theme.to})` }}
                aria-hidden="true"
              >
                {theme.emoji}
              </span>
              <span className="text-[11px] font-bold">{tt(theme.id)}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <Field label={t('music')}>
        {(p) => (
          <Select
            {...p}
            value={doc.music ?? 'none'}
            onChange={(e) =>
              updateSettings({ music: e.target.value === 'none' ? null : e.target.value })
            }
          >
            {MUSIC_TRACKS.map((m) => (
              <option key={m} value={m}>
                {t(`musicTracks.${m}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <div>
        <label htmlFor="quiz-tags" className="mb-1.5 block text-sm font-bold">
          {t('tags')}
        </label>
        <div className="flex flex-wrap gap-1.5 rounded-2xl border-2 border-line bg-surface p-2 focus-within:border-accent">
          {doc.tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 rounded-full bg-accent/15 py-1 pr-1 pl-2.5 text-xs font-bold text-accent"
            >
              #{tag}
              <button
                type="button"
                aria-label={`${t('removeMedia')} ${tag}`}
                onClick={() => updateSettings({ tags: doc.tags.filter((x) => x !== tag) })}
                className="cursor-pointer rounded-full p-0.5 hover:bg-accent/25"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            id="quiz-tags"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={addTag}
            placeholder={doc.tags.length ? '' : t('tagsPlaceholder')}
            className="min-w-24 flex-1 bg-transparent px-1 text-sm outline-none"
          />
        </div>
      </div>

      <p className="text-center text-xs font-bold text-muted">
        ⏱{' '}
        {t('estimatedDuration', {
          minutes: Math.max(1, Math.round(estimateDurationSeconds(doc) / 60)),
        })}
      </p>
    </div>
  );
}
