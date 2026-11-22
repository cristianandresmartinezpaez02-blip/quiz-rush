// Service worker de Quiz_Rush: app instalable, página sin conexión y notificaciones push.
//
// Estrategia de caché:
//  • Navegación: siempre red primero, con precarga de navegación (los datos cambian en tiempo
//    real). Sin conexión se
//    muestra /sin-conexion, que se guarda al instalar JUNTO con su CSS y JS (así se ve bien).
//  • /_next/static, /icons, /sounds: caché primero en producción (llevan hash o no cambian).
//    En desarrollo (`?dev=1`) red primero, para no romper la recarga en caliente; la caché
//    solo se usa si no hay conexión.
//  • El API y los sockets nunca pasan por la caché.
const VERSION = 'qr-v3';
const STATIC_CACHE = `${VERSION}-static`;
const PAGES_CACHE = `${VERSION}-pages`;
const OFFLINE_URL = '/sin-conexion';
const DEV = new URL(self.location.href).searchParams.has('dev');

/** Guarda la página sin conexión y todos los CSS/JS que enlaza. */
async function precacheOffline() {
  const cache = await caches.open(PAGES_CACHE);
  const res = await fetch(OFFLINE_URL, { cache: 'reload' });
  if (!res.ok) return;
  const html = await res.clone().text();
  await cache.put(OFFLINE_URL, res);
  const assets = [...new Set(html.match(/\/_next\/static\/[^"'\s)]+/g) ?? [])];
  await Promise.all(
    [...assets, '/icon.svg', '/icons/icon-192.png'].map((a) => cache.add(a).catch(() => {})),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    precacheOffline()
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      // Precarga de navegación: el navegador pide la página a la vez que arranca el service
      // worker, con sus cabeceras de navegación reales (así la caché de páginas del servidor
      // la reconoce como visita) y sin esperar a que el worker despierte.
      .then(() => self.registration.navigationPreload?.enable())
      .then(() => self.clients.claim()),
  );
});

function isStatic(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/sounds/') ||
    url.pathname === '/icon.svg'
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const preloaded = await event.preloadResponse;
          if (preloaded) return preloaded;
          return await fetch(request);
        } catch {
          return (await caches.match(OFFLINE_URL)) ?? Response.error();
        }
      })(),
    );
    return;
  }

  if (!isStatic(url)) return;
  if (DEV) {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(request)) ?? Response.error()),
    );
    return;
  }
  event.respondWith(
    caches.match(request).then(async (hit) => {
      if (hit) return hit;
      const res = await fetch(request);
      if (res.ok) {
        const cache = await caches.open(STATIC_CACHE);
        cache.put(request, res.clone());
      }
      return res;
    }),
  );
});

// ───────────────────────── Push ─────────────────────────

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Quiz_Rush';
  event.waitUntil(
    (async () => {
      // Avisar a las pestañas abiertas para que la campana se actualice al instante
      const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const tab of tabs) tab.postMessage({ type: 'notification' });
      await self.registration.showNotification(title, {
        body: data.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-96.png',
        tag: data.tag,
        data: { url: data.url || '/notificaciones' },
        lang: 'es',
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const same = tabs.find((t) => t.url === target);
      if (same) return same.focus();
      const any = tabs.find((t) => new URL(t.url).origin === self.location.origin);
      if (any) {
        await any.focus();
        return any.navigate(target);
      }
      return self.clients.openWindow(target);
    })(),
  );
});
