'use client';
// Invitar amigos a la partida desde la sala de espera: les llega un aviso (y un push) con el PIN.
import { Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { AvatarConfig, PresenceActivity } from '@quiz-rush/shared';
import { AvatarArt } from '@/components/avatar/avatar-art';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { apiFetch } from '@/lib/client-api';
import { PresenceDot } from './presence-dot';

interface Friend {
  id: string;
  displayName: string;
  username: string;
  avatar: AvatarConfig;
  presence: { activity: PresenceActivity } | null;
}

export function InviteFriendsButton({ pin }: { pin: string }) {
  const t = useTranslations('friends');
  const te = useTranslations('errors');
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    void apiFetch<{ friends: Friend[] }>('/api/friends')
      .then((r) => setFriends(r.friends))
      .catch(() => setFriends([]));
  }, [open]);

  async function invite() {
    setBusy(true);
    try {
      const r = await apiFetch<{ invited: number }>('/api/friends/invite', {
        method: 'POST',
        body: { friendIds: [...picked], pin },
      });
      toast.success(t('invited', { count: r.invited }));
      setSent((s) => new Set([...s, ...picked]));
      setPicked(new Set());
      setOpen(false);
    } catch (err) {
      const c = (err as Error).message;
      toast.error(te.has(c) ? te(c as 'INTERNAL') : te('INTERNAL'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="accent" size="sm" onClick={() => setOpen(true)}>
        <Send className="size-4" /> {t('inviteFriends')}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`🎮 ${t('inviteFriends')}`}>
        {!friends ? (
          <p className="py-6 text-center text-muted">…</p>
        ) : friends.length === 0 ? (
          <p className="py-6 text-center text-muted">{t('inviteNoFriends')}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">{t('inviteHelp')}</p>
            <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
              {friends.map((f) => {
                const label = f.presence ? t(`activity.${f.presence.activity}`) : t('offline');
                return (
                  <li key={f.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-2">
                      <input
                        type="checkbox"
                        className="size-5"
                        checked={picked.has(f.id)}
                        disabled={sent.has(f.id)}
                        onChange={(e) =>
                          setPicked((p) => {
                            const next = new Set(p);
                            if (e.target.checked) next.add(f.id);
                            else next.delete(f.id);
                            return next;
                          })
                        }
                      />
                      <span className="relative">
                        <AvatarArt config={f.avatar} size={36} />
                        <PresenceDot activity={f.presence?.activity ?? null} label={label} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{f.displayName}</span>
                        <span className="text-xs text-muted">
                          {sent.has(f.id) ? `✓ ${t('inviteSent')}` : label}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <Button onClick={() => void invite()} disabled={picked.size === 0} loading={busy}>
              <Send className="size-4" /> {t('sendInvites', { count: picked.size })}
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
