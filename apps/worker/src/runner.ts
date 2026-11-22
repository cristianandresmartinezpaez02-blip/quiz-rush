// Ejecuta un trabajo llamando a su ruta interna en la web (la lógica vive allí, una sola vez).
// Un error HTTP o de red lanza una excepción: BullMQ reintenta con espera exponencial.
import type { JobName, JobResult } from '@quiz-rush/shared';

export interface RunnerConfig {
  webUrl: string;
  secret: string;
  /** fetch inyectable (pruebas) */
  fetchFn?: typeof fetch;
}

/** Tiempo máximo por trabajo: la moderación con IA puede tardar varios minutos. */
export function timeoutFor(name: JobName): number {
  return name === 'moderation' ? 290_000 : 60_000;
}

export class JobHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function runJob(cfg: RunnerConfig, name: JobName, data: unknown): Promise<JobResult> {
  const fetchFn = cfg.fetchFn ?? fetch;
  const res = await fetchFn(`${cfg.webUrl.replace(/\/$/, '')}/api/internal/jobs/${name}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${cfg.secret}`, 'content-type': 'application/json' },
    body: JSON.stringify(data ?? {}),
    signal: AbortSignal.timeout(timeoutFor(name)),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new JobHttpError(res.status, `${name}: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  return (await res.json()) as JobResult;
}
