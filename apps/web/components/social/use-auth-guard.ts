'use client';
// Comprueba si el visitante puede hacer una acción; si no, lo guía (login o crear cuenta).
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

export interface Viewer {
  id: string;
  isGuest: boolean;
}

export function useAuthGuard(viewer: Viewer | null) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('quiz');

  /**
   * @param needsAccount true si la acción exige cuenta real (calificar, comentar, seguir, reportar)
   * @returns true si puede continuar
   */
  return (needsAccount = false): boolean => {
    if (!viewer) {
      router.push(`/entrar?volver=${encodeURIComponent(pathname)}`);
      return false;
    }
    if (needsAccount && viewer.isGuest) {
      toast.info(t('accountRequired'), {
        action: {
          label: t('createAccount'),
          onClick: () => router.push(`/registro?volver=${encodeURIComponent(pathname)}`),
        },
      });
      return false;
    }
    return true;
  };
}
