'use client';
// Botón "Seguir / Siguiendo" con actualización optimista.
import { UserCheck, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { haptic } from '@/lib/utils';
import { useAuthGuard, type Viewer } from './use-auth-guard';

export function FollowButton({
  userId,
  initialFollowing,
  viewer,
  onChange,
  size = 'sm',
}: {
  userId: string;
  initialFollowing: boolean;
  viewer: Viewer | null;
  onChange?: (following: boolean, followersCount: number) => void;
  size?: 'sm' | 'md';
}) {
  const t = useTranslations('social');
  const guard = useAuthGuard(viewer);
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);

  if (viewer?.id === userId) return null;

  async function toggle() {
    if (!guard(true)) return;
    const next = !following;
    setFollowing(next); // optimista
    setBusy(true);
    haptic(10);
    try {
      const res = await fetch(`/api/users/${userId}/follow`, { method: next ? 'POST' : 'DELETE' });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { following: boolean; followersCount: number };
      onChange?.(data.following, data.followersCount);
      if (next) toast.success(t('followedToast'));
    } catch {
      setFollowing(!next);
      toast.error(t('error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      size={size}
      variant={following ? 'outline' : 'accent'}
      onClick={toggle}
      disabled={busy}
      aria-pressed={following}
    >
      {following ? <UserCheck className="size-4" /> : <UserPlus className="size-4" />}
      {following ? t('following') : t('follow')}
    </Button>
  );
}
