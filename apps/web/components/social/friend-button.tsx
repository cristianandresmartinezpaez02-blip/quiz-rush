'use client';
// Botón de amistad del perfil: añadir · solicitud enviada (cancelar) · aceptar · amigos.
import { Check, Clock, UserCheck, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/client-api';
import type { FriendStatus } from '@/lib/social-service';
import { useAuthGuard, type Viewer } from './use-auth-guard';

export function FriendButton({
  userId,
  username,
  initialStatus,
  viewer,
}: {
  userId: string;
  username: string;
  initialStatus: FriendStatus;
  viewer: Viewer | null;
}) {
  const t = useTranslations('friends');
  const te = useTranslations('errors');
  const guard = useAuthGuard(viewer);
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);

  if (viewer?.id === userId || status === 'blocked') return null;

  async function run(fn: () => Promise<{ status: FriendStatus }>, ok?: string) {
    if (!guard(true)) return;
    setBusy(true);
    try {
      setStatus((await fn()).status);
      if (ok) toast.success(ok);
    } catch (err) {
      const c = (err as Error).message;
      toast.error(te.has(c) ? te(c as 'INTERNAL') : te('INTERNAL'));
    } finally {
      setBusy(false);
    }
  }

  const post = (action: string) => () =>
    apiFetch<{ status: FriendStatus }>(`/api/friends/${userId}`, {
      method: 'POST',
      body: { action },
    });

  if (status === 'friends') {
    return (
      <Button variant="outline" loading={busy} disabled title={t('alreadyFriends')}>
        <UserCheck className="size-4" /> {t('alreadyFriends')}
      </Button>
    );
  }
  if (status === 'outgoing') {
    return (
      <Button
        variant="ghost"
        loading={busy}
        onClick={() => void run(post('cancel'))}
        title={t('cancel')}
      >
        <Clock className="size-4" /> {t('pending')}
      </Button>
    );
  }
  if (status === 'incoming') {
    return (
      <Button loading={busy} onClick={() => void run(post('accept'), t('nowFriendsShort'))}>
        <Check className="size-4" /> {t('acceptRequest')}
      </Button>
    );
  }
  return (
    <Button
      variant="accent"
      loading={busy}
      onClick={() =>
        void run(
          () =>
            apiFetch<{ status: FriendStatus }>('/api/friends', {
              method: 'POST',
              body: { username },
            }),
          t('requestSent'),
        )
      }
    >
      <UserPlus className="size-4" /> {t('add')}
    </Button>
  );
}
