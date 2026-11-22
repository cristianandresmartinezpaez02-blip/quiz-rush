// Caché de página completa para visitantes SIN sesión (Fase 8).
//
// La portada, la Biblioteca y las fichas de quiz se renderizan en el servidor en cada visita
// (~20 ms de CPU cada una). Para un visitante anónimo el resultado es idéntico al de cualquier
// otro con el mismo idioma, así que se guarda en Redis unos segundos y se sirve desde ahí:
// miles de visitas a la vez cuestan un solo renderizado.
//
// Reglas (seguridad ante todo):
//  • Solo GET de las rutas del `matcher` y solo si no hay más cookies que la del idioma: con
//    sesión (también la de invitado) siempre se renderiza para esa persona.
//  • Solo navegaciones de documento (Accept: text/html y, si viene, Sec-Fetch-Dest: document).
//    Next quita las cabeceras RSC antes de llegar aquí, así que las peticiones internas de
//    navegación de React (fetch con Accept */*) se distinguen así y nunca reciben HTML.
//  • Solo respuestas 200 en HTML y sin Set-Cookie.
//  • Peticiones simultáneas a la misma página sin caché: un único renderizado (por instancia).
//  • PAGE_CACHE_SECONDS (por defecto 30 en producción; 0 lo desactiva). En desarrollo, apagado.
import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from './i18n/config';
import { redis, redisReady } from './lib/redis';

// Vacío o sin definir = valor por defecto (así copiar .env.example no la apaga sin querer)
const TTL = process.env.PAGE_CACHE_SECONDS
  ? Number(process.env.PAGE_CACHE_SECONDS)
  : process.env.NODE_ENV === 'production'
    ? 30
    : 0;
const BYPASS = 'x-page-cache-bypass';
const MAX_BYTES = 1_000_000;

const CONTENT_TYPE = 'text/html; charset=utf-8';
/** Copia en memoria por instancia (3 s): la mayoría de visitas ni siquiera van a Redis. */
const MEMORY_MS = 3000;
const memory = new Map<string, { html: string; until: number }>();
const inflight = new Map<string, Promise<string | null>>();

function remember(key: string, html: string) {
  if (memory.size > 500) memory.clear(); // tope de seguridad (pocas páginas × 2 idiomas)
  memory.set(key, { html, until: Date.now() + MEMORY_MS });
}

function localeOf(req: NextRequest): Locale {
  const fromCookie = req.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  for (const part of (req.headers.get('accept-language') ?? '').split(',')) {
    const code = part.split(';')[0]?.trim().slice(0, 2).toLowerCase();
    if (isLocale(code)) return code;
  }
  return DEFAULT_LOCALE;
}

function cacheable(req: NextRequest) {
  if (TTL <= 0 || req.method !== 'GET' || !redisReady()) return false;
  if (req.headers.has(BYPASS) || req.headers.has('next-action') || req.headers.has('next-url'))
    return false;
  if (!(req.headers.get('accept') ?? '').includes('text/html')) return false;
  const dest = req.headers.get('sec-fetch-dest');
  if (dest && dest !== 'document') return false;
  // Cualquier cookie que no sea la del idioma (sesión, invitado…) = página personal
  return req.cookies.getAll().every((c) => c.name === LOCALE_COOKIE);
}

/** Renderiza la página (petición a esta misma app, saltándose la caché) y la guarda. */
async function render(req: NextRequest, key: string): Promise<string | null> {
  const res = await fetch(req.nextUrl, {
    headers: {
      [BYPASS]: '1',
      'accept-language': req.headers.get('accept-language') ?? '',
      ...(req.cookies.get(LOCALE_COOKIE) && {
        cookie: `${LOCALE_COOKIE}=${req.cookies.get(LOCALE_COOKIE)!.value}`,
      }),
    },
    redirect: 'manual',
    cache: 'no-store',
  });
  const contentType = res.headers.get('content-type') ?? '';
  if (res.status !== 200 || !contentType.includes('text/html') || res.headers.has('set-cookie'))
    return null;
  const html = await res.text();
  if (html.length > MAX_BYTES) return null;
  await redis.set(key, html, 'EX', TTL).catch(() => {});
  return html;
}

export async function proxy(req: NextRequest) {
  if (!cacheable(req)) return NextResponse.next();
  const key = `page:${localeOf(req)}:${req.nextUrl.pathname}${req.nextUrl.search}`;
  try {
    const mem = memory.get(key);
    let state = 'HIT-MEMORY';
    let html: string | null = mem && mem.until > Date.now() ? mem.html : null;
    if (!html) {
      state = 'HIT';
      html = await redis.get(key);
    }
    if (!html) {
      state = 'MISS';
      let pending = inflight.get(key);
      if (!pending) {
        pending = render(req, key).finally(() => inflight.delete(key));
        inflight.set(key, pending);
      }
      html = await pending;
    }
    if (!html) return NextResponse.next();
    if (state !== 'HIT-MEMORY') remember(key, html);
    return new NextResponse(html, {
      status: 200,
      headers: {
        'content-type': CONTENT_TYPE,
        // Es la versión anónima: ningún navegador ni CDN debe reutilizarla para otra persona
        'cache-control': 'private, no-cache',
        vary: 'Accept, Cookie, Accept-Language',
        'x-page-cache': state,
      },
    });
  } catch {
    return NextResponse.next(); // Redis caído: se renderiza como siempre
  }
}

export const config = {
  matcher: ['/', '/biblioteca', '/quiz/:id'],
};
