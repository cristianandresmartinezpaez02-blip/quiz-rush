// Fase 7 en el navegador: amigos y presencia, invitar desde la sala de espera, clubes,
// notificaciones, ajustes de accesibilidad, compartir resultado, página sin conexión y panel de
// administración. Además pasa una auditoría automática de accesibilidad (axe) por las páginas
// principales y falla si hay problemas graves.
// Uso: node e2e/screenshots-phase7.mjs [carpeta-salida]   (requiere npm run dev y db:seed)
import AxeBuilder from '@axe-core/playwright';
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const OUT = process.argv[2] ?? 'e2e/screenshots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--disable-gpu'] });
const errors = [];
const a11y = [];
/** Durante la prueba sin conexión los fallos de red son lo esperado (y el cliente de recarga en caliente de desarrollo) */
let offline = false;

async function open(viewport, label, email, extra = {}) {
  const ctx = await browser.newContext({
    viewport,
    colorScheme: 'dark',
    locale: 'es-CO',
    hasTouch: viewport.width < 500,
    ...extra,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => !offline && errors.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !offline && !m.text().includes('caret-color'))
      errors.push(`[${label}] console: ${m.text().slice(0, 200)}`);
  });
  page.on('dialog', (d) => d.accept());
  if (email) {
    await page.goto(`${BASE}/entrar`);
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByLabel('Contraseña').fill('QuizRush123!');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.waitForURL('**/mis-quizzes');
  }
  return page;
}

async function shot(page, name) {
  console.log('📸', name);
  await page.waitForTimeout(400);
  for (let attempt = 1; ; attempt++) {
    try {
      return await page.screenshot({
        path: `${OUT}/${name}.png`,
        animations: 'disabled',
        timeout: 60_000,
      });
    } catch (err) {
      if (attempt >= 3) throw err;
      await page.waitForTimeout(500);
    }
  }
}

/** Auditoría axe (WCAG 2.1 A/AA): guarda las infracciones serias o críticas. */
async function audit(page, name) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const bad = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  for (const v of bad) {
    a11y.push(
      `[${name}] ${v.impact} ${v.id}: ${v.help} → ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(' '))
        .join(' | ')}`,
    );
  }
  console.log(`♿ ${name}: ${bad.length ? `${bad.length} problemas` : 'sin problemas graves'}`);
}

const go = async (page, path) => {
  await page.goto(BASE + path);
  await page.waitForLoadState('networkidle');
};

const phone = { width: 390, height: 844 };
const desktop = { width: 1440, height: 900 };

try {
  // Sofi en el móvil (su latido de presencia la pone "en línea")
  const sofi = await open(phone, 'sofi', 'sofi@quizrush.dev');
  const demo = await open(desktop, 'demo', 'demo@quizrush.dev');

  // ── Amigos ──
  await go(demo, '/amigos');
  await demo.getByRole('tab', { name: /Mis amigos/ }).click();
  await shot(demo, 'p7-01-amigos');
  await audit(demo, '/amigos');
  await demo.getByRole('tab', { name: /Solicitudes/ }).click();
  await shot(demo, 'p7-02-solicitudes');
  await demo.getByRole('tab', { name: /Añadir/ }).click();
  await demo.getByLabel('Buscar personas').fill('ju');
  await demo.getByRole('button', { name: 'Buscar' }).click();
  await demo.waitForTimeout(800);
  await shot(demo, 'p7-03-buscar-personas');

  await go(demo, '/perfil/sofi');
  await shot(demo, 'p7-04-perfil-amigo');

  // ── Invitar desde la sala de espera ──
  const quizzes = await (await demo.request.get(`${BASE}/api/quizzes`)).json();
  const quiz = quizzes.items.find((q) => q.status === 'PUBLISHED');
  const { gameId } = await (
    await demo.request.post(`${BASE}/api/games`, {
      data: { quizId: quiz.id },
      headers: { origin: BASE },
    })
  ).json();
  await go(demo, `/host/${gameId}`);
  await demo.getByRole('button', { name: 'Invitar amigos' }).click();
  await demo.getByRole('dialog').waitFor();
  await demo.getByRole('dialog').getByRole('checkbox').first().check();
  await shot(demo, 'p7-05-invitar-amigos');
  await demo.getByRole('button', { name: /Invitar a 1 amigo/ }).click();
  await demo.getByRole('dialog').waitFor({ state: 'hidden' });

  // Sofi ve la invitación en la campana y en su página de avisos
  await go(sofi, '/notificaciones');
  await shot(sofi, 'p7-06-notificaciones-movil');
  await audit(sofi, '/notificaciones');

  // ── Clubes ──
  await go(demo, '/clubes');
  await shot(demo, 'p7-07-clubes');
  await audit(demo, '/clubes');
  await demo.getByRole('button', { name: 'Crear un club' }).click();
  await demo.getByRole('dialog').waitFor();
  await demo.getByLabel('Nombre del club').fill('Los Veloces');
  await shot(demo, 'p7-08-crear-club');
  await demo.keyboard.press('Escape');
  await go(demo, '/clubes/los-cerebritos');
  await shot(demo, 'p7-09-club');
  await audit(demo, '/clubes/los-cerebritos');
  await go(sofi, '/clubes/equipo-demo');
  await shot(sofi, 'p7-10-club-privado-movil');

  // ── Ajustes (accesibilidad, privacidad y push) ──
  await go(demo, '/ajustes');
  await demo.getByText('Tamaño del texto').scrollIntoViewIfNeeded();
  await shot(demo, 'p7-11-ajustes');
  await audit(demo, '/ajustes');

  // Texto grande en el móvil (se guarda y se restaura)
  await sofi.request.patch(`${BASE}/api/profile`, {
    data: { textScale: 130 },
    headers: { origin: BASE },
  });
  await go(sofi, '/');
  await shot(sofi, 'p7-12-texto-grande-movil');
  await sofi.request.patch(`${BASE}/api/profile`, {
    data: { textScale: 100 },
    headers: { origin: BASE },
  });

  // ── Compartir: práctica rápida y su tarjeta ──
  await go(sofi, `/quiz/${quiz.id}`);
  await sofi
    .getByRole('button', { name: /Practicar/ })
    .first()
    .click();
  await sofi.waitForURL('**/solo/**');
  await sofi.waitForTimeout(800);
  // Teclado: la tecla 1 responde la primera opción (si la pregunta es de opciones)
  await sofi.keyboard.press('1');
  await sofi.waitForTimeout(600);
  await shot(sofi, 'p7-13-respuesta-con-teclado');
  await sofi.getByRole('button', { name: 'Siguiente' }).click();
  await sofi.getByRole('button', { name: 'Terminar ahora' }).click();
  await sofi.getByRole('button', { name: /Compartir resultado/ }).waitFor({ timeout: 20_000 });
  await shot(sofi, 'p7-14-compartir');

  // ── Resultado compartido (vista pública, sin sesión) ──
  const anon = await open(desktop, 'anon');
  const lastPlayer = await sofi.locator('[data-share-id]').first().getAttribute('data-share-id');
  if (lastPlayer) {
    await go(anon, `/resultado/${lastPlayer}`);
    await shot(anon, 'p7-15-resultado-compartido');
    await audit(anon, '/resultado');
  }

  // ── Sin conexión (service worker) ──
  await go(anon, '/');
  await anon.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await anon.waitForTimeout(500);
  offline = true;
  await anon.context().setOffline(true);
  await anon.goto(`${BASE}/biblioteca`).catch(() => {});
  await anon.getByRole('heading', { name: 'Sin conexión' }).waitFor({ timeout: 10_000 });
  await shot(anon, 'p7-16-sin-conexion');
  await anon.context().setOffline(false);
  await anon.goto(BASE + '/').catch(() => {});
  await anon.waitForTimeout(1000);
  offline = false;

  // ── Administración ──
  const admin = await open(desktop, 'admin', 'admin@quizrush.dev');
  await go(admin, '/admin');
  await shot(admin, 'p7-17-admin-resumen');
  await audit(admin, '/admin');
  await admin.getByRole('tab', { name: /Reportes/ }).click();
  await admin.waitForTimeout(800);
  await shot(admin, 'p7-18-admin-reportes');
  await admin.getByRole('tab', { name: /Personas/ }).click();
  await admin.waitForTimeout(800);
  await shot(admin, 'p7-19-admin-personas');

  // Auditorías extra de páginas existentes (regresión)
  await go(anon, '/');
  await audit(anon, '/');
  await go(anon, '/biblioteca');
  await audit(anon, '/biblioteca');
  await go(demo, '/mis-quizzes');
  await audit(demo, '/mis-quizzes');
  await go(demo, '/solo');
  await audit(demo, '/solo');
} catch (err) {
  errors.push(`💥 ${err.message}`);
}

await browser.close();
console.log(
  a11y.length
    ? `\n♿ ${a11y.length} problemas de accesibilidad:\n${a11y.join('\n')}`
    : '\n♿ Accesibilidad: sin problemas graves',
);
console.log(
  errors.length
    ? `\n⚠️ ${errors.length} errores:\n${errors.join('\n')}`
    : '\n✅ Sin errores en consola',
);
process.exit(errors.length || a11y.length ? 1 : 0);
