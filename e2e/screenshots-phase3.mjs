// Partida en vivo real en el navegador: anfitrión (escritorio), dos jugadores (celular)
// y la pantalla de proyector, todos a la vez. Toma capturas de cada fase.
// Uso: node e2e/screenshots-phase3.mjs [carpeta-salida]   (requiere npm run dev y db:seed)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const OUT = process.argv[2] ?? 'e2e/screenshots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--disable-gpu', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];

async function open(viewport, label) {
  const ctx = await browser.newContext({
    viewport,
    colorScheme: 'dark',
    locale: 'es-CO',
    hasTouch: viewport.width < 500,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('caret-color'))
      errors.push(`[${label}] console: ${m.text().slice(0, 200)}`);
  });
  page.on('dialog', (d) => d.accept()); // confirmaciones del anfitrión
  return page;
}

async function shot(page, name) {
  console.log('📸', name);
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

const phone = { width: 390, height: 844 };

// ── Anfitrión: entra y organiza la partida desde la página del quiz ──
const host = await open({ width: 1440, height: 900 }, 'anfitrión');
await host.goto(`${BASE}/entrar`);
await host.getByLabel('Correo electrónico').fill('demo@quizrush.dev');
await host.getByLabel('Contraseña').fill('QuizRush123!');
await host.getByRole('button', { name: 'Entrar', exact: true }).click();
await host.waitForURL('**/mis-quizzes');
await host.goto(`${BASE}/biblioteca?q=animales`);
await host
  .getByRole('link', { name: /^Animales asombrosos/ })
  .first()
  .click();
await host.waitForURL('**/quiz/**');
await host.getByRole('button', { name: 'Organizar partida' }).click();
await host.waitForURL('**/host/**');
await host.getByText('PIN de juego').waitFor({ timeout: 20_000 });
const pin = (
  await host
    .locator('p[aria-label]')
    .filter({ hasText: /^\d{3} \d{3}$/ })
    .first()
    .textContent()
).replace(/\s/g, '');
console.log('PIN:', pin);
await host.waitForTimeout(500);
await shot(host, 'p3-01-host-sala-vacia');

// ── Pantalla de proyector (espectador) ──
const screenHref = await host
  .getByRole('link', { name: 'Abrir pantalla de proyector' })
  .getAttribute('href');
const screen = await open({ width: 1280, height: 720 }, 'pantalla');
await screen.goto(`${BASE}${screenHref}`);
await screen.getByText('PIN de juego').waitFor();

// ── Dos jugadores entran por el enlace del QR ──
const players = [];
for (const [nick, i] of [
  ['Ana', 0],
  ['Beto', 1],
]) {
  const p = await open(phone, nick);
  await p.goto(`${BASE}/jugar?pin=${pin}`);
  await p.getByLabel('Tu apodo').waitFor({ timeout: 15_000 });
  if (i === 0) await shot(p, 'p3-02-jugador-apodo');
  await p.getByLabel('Tu apodo').fill(nick);
  await p.getByRole('button', { name: '¡Vamos!' }).click();
  await p.getByText('¡Estás dentro!').waitFor();
  players.push(p);
}
await shot(players[0], 'p3-03-jugador-dentro');
// Reacciones desde los celulares
await players[0].getByRole('button', { name: 'Reaccionar 🔥' }).click();
await players[1].getByRole('button', { name: 'Reaccionar 😂' }).click();
await host.getByText('2 jugadores listos').waitFor();
await host.waitForTimeout(400);
await shot(host, 'p3-04-host-sala-con-jugadores');

// ── Empieza la partida ──
await host.getByRole('button', { name: '¡Empezar!' }).click();
await host.getByText('Pregunta 1 de 5').waitFor();
await host.waitForTimeout(700);
await shot(host, 'p3-05-host-preparate');
await players[0]
  .locator('button[aria-label]')
  .filter({ has: players[0].locator('svg') })
  .nth(0)
  .waitFor();
await host.getByText('respuestas').waitFor({ timeout: 10_000 });
await shot(host, 'p3-06-host-pregunta');
await shot(players[0], 'p3-07-jugador-botonera');

// Ana elige la primera opción, Beto la segunda → todos respondieron: cierre inmediato
const pad = (p) => p.locator('main button.min-h-28');
await pad(players[0]).nth(0).click();
await players[0].getByText('¡Respuesta enviada!').waitFor();
await shot(players[0], 'p3-08-jugador-enviada');
await pad(players[1]).nth(1).click();
await host.getByText(/de 2 acertaron/).waitFor({ timeout: 10_000 });
await host.waitForTimeout(900);
await shot(host, 'p3-09-host-revelar');
await players[0].getByText('Tu puesto').waitFor();
await players[0].waitForTimeout(1200);
await shot(players[0], 'p3-10-jugador-resultado-ana');
await shot(players[1], 'p3-11-jugador-resultado-beto');
await shot(screen, 'p3-12-pantalla-espectador');

// ── Ranking animado ──
await host.getByRole('button', { name: 'Ver ranking' }).click();
await host.getByRole('heading', { name: /Ranking/ }).waitFor();
await host.waitForTimeout(1500);
await shot(host, 'p3-13-host-ranking');

// ── Pregunta 2 y fin de partida ──
await host.getByRole('button', { name: 'Siguiente pregunta' }).click();
await host.getByText('Pregunta 2 de 5').waitFor();
await pad(players[0]).first().waitFor({ timeout: 10_000 });
await pad(players[0]).nth(0).click();
await pad(players[1]).nth(0).click();
await host.getByText(/de 2 acertaron/).waitFor({ timeout: 10_000 });

// Reconexión: Beto recarga la página y vuelve a la partida con sus puntos
const scoreBefore = await players[1].getByLabel('Tu puntaje').textContent();
await players[1].reload();
await players[1].getByText('Tu puesto').waitFor({ timeout: 15_000 });
const scoreAfter = await players[1].getByLabel('Tu puntaje').textContent();
console.log(`Beto antes/después de recargar: ${scoreBefore} / ${scoreAfter}`);
if (scoreBefore !== scoreAfter) errors.push('La reconexión cambió el puntaje');

await host.getByRole('button', { name: 'Terminar' }).click();
await host.getByText('¡Tenemos ganadores!').waitFor({ timeout: 10_000 });
await host.waitForTimeout(4500); // pedestales + momentos destacados
await shot(host, 'p3-14-host-podio');
await players[0].waitForTimeout(500);
await shot(players[0], 'p3-15-jugador-final');

await browser.close();
console.log(
  errors.length
    ? `⚠️ Problemas:\n${errors.join('\n')}`
    : '✅ Partida completa sin errores de consola',
);
process.exit(errors.length ? 1 : 0);
