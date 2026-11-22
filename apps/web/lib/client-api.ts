'use client';
// Llamadas al API desde el navegador. Si la respuesta no es correcta lanza un Error cuyo
// mensaje es el código del servidor (p. ej. "NOT_ENOUGH_COINS") para traducirlo en la interfaz.

export async function apiFetch<T>(
  path: string,
  { method = 'GET', body }: { method?: string; body?: unknown } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('OFFLINE');
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(data?.error ?? `HTTP_${res.status}`);
  return data as T;
}

/** Empieza una partida individual y devuelve su id (para ir a /solo/:id). */
export async function startSoloGame(input: Record<string, unknown>): Promise<string> {
  const { id } = await apiFetch<{ id: string }>('/api/solo', { method: 'POST', body: input });
  return id;
}
