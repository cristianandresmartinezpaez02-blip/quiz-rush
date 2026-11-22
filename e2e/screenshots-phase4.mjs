// Fase 4 en el navegador: editor de los tipos nuevos y partida completa del quiz de los 14 tipos
// en modo Jefe final (anfitrión en escritorio, dos celulares y la pantalla de proyector).
// Uso: node e2e/screenshots-phase4.mjs [carpeta-salida]   (requiere npm run dev y db:seed)
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
  page.on('dialog', (d) => d.accept());
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

// ── Anfitrión: entra ──
const host = await open({ width: 1440, height: 900 }, 'anfitrión');
await host.goto(`${BASE}/entrar`);
await host.waitForLoadState('networkidle'); // que la página esté hidratada antes de enviar
await host.getByLabel('Correo electrónico').fill('demo@quizrush.dev');
await host.getByLabel('Contraseña').fill('QuizRush123!');
await host.getByRole('button', { name: 'Entrar', exact: true }).click();
await host.waitForURL('**/mis-quizzes');
await host.goto(`${BASE}/biblioteca?q=tour`);
await host
  .getByRole('link', { name: /^Tour de Quiz_Rush/ })
  .first()
  .click();
await host.waitForURL('**/quiz/**');
const quizId = new URL(host.url()).pathname.split('/').pop();

// ── Editor: configuración de los tipos nuevos ──
const editor = await open({ width: 1440, height: 900 }, 'editor');
await editor.context().addCookies(await host.context().cookies());
await editor.goto(`${BASE}/crear/${quizId}`);
for (const [prompt, name] of [
  ['Ordena del más pequeño', 'p4-01-editor-ordenar'],
  ['Empareja cada país', 'p4-02-editor-emparejar'],
  ['A qué temperatura hierve', 'p4-03-editor-deslizador'],
  ['Toca el faro', 'p4-04-editor-pin'],
  ['El agua está formada', 'p4-05-editor-completar'],
  ['Dibuja la palabra secreta', 'p4-06-editor-dibujo'],
]) {
  await editor.locator('aside, nav, ol, ul').getByText(prompt).first().click();
  await editor.getByLabel('Escribe tu pregunta aquí…').waitFor();
  await editor.waitForTimeout(700);
  await shot(editor, name);
}
await editor.context().close();

// ── Organiza la partida y elige el modo Jefe final ──
await host.getByRole('button', { name: 'Organizar partida' }).click();
await host.waitForURL('**/host/**');
await host.getByText('PIN de juego').waitFor({ timeout: 20_000 });
await host.getByRole('radio', { name: /Jefe final/ }).click();
await host.waitForTimeout(400);
const pin = (
  await host
    .locator('p[aria-label]')
    .filter({ hasText: /^\d{3} \d{3}$/ })
    .first()
    .textContent()
).replace(/\s/g, '');

const screenHref = await host
  .getByRole('link', { name: 'Abrir pantalla de proyector' })
  .getAttribute('href');
const screen = await open({ width: 1280, height: 720 }, 'pantalla');
await screen.goto(`${BASE}${screenHref}`);
await screen.getByText('PIN de juego').waitFor();

const players = [];
for (const nick of ['Ana', 'Beto']) {
  const p = await open(phone, nick);
  await p.goto(`${BASE}/jugar?pin=${pin}`);
  await p.getByLabel('Tu apodo').waitFor({ timeout: 15_000 });
  await p.getByLabel('Tu apodo').fill(nick);
  await p.getByRole('button', { name: '¡Vamos!' }).click();
  await p.getByText('¡Estás dentro!').waitFor();
  players.push(p);
}
await host.getByText('2 jugadores listos').waitFor();
await shot(host, 'p4-07-host-sala-modo-jefe');
await shot(players[0], 'p4-08-jugador-sala-modo');

const [ana, beto] = players;
const send = (p) => p.getByRole('button', { name: 'Enviar' }).first();

/** Cierra la pregunta (si sigue abierta) y espera la revelación. */
async function toReveal() {
  const skip = host.getByRole('button', { name: 'Saltar' });
  if (await skip.isVisible().catch(() => false)) await skip.click().catch(() => {});
  await host.getByRole('button', { name: /Ver ranking|Ver podio/ }).waitFor({ timeout: 25_000 });
  await host.waitForTimeout(1200);
}

await host.getByRole('button', { name: '¡Empezar!' }).click();
for (let n = 1; n <= 14; n++) {
  await host.getByText(`Pregunta ${n} de 14`).first().waitFor({ timeout: 20_000 });
  await host.getByRole('button', { name: 'Saltar' }).click(); // abre ya las respuestas
  await ana.waitForTimeout(900);

  if (n === 1) {
    await shot(ana, 'p4-09-jugador-powerups');
    await shot(host, 'p4-10-host-pregunta-jefe');
  }
  if (n === 4) {
    await shot(ana, 'p4-11-jugador-ordenar');
    await send(ana).click();
  }
  if (n === 5) {
    // Emparejar tocando izquierda → derecha
    const left = ana.getByRole('list', { name: 'Elementos' }).getByRole('button');
    const right = ana.getByRole('list', { name: 'Parejas' }).getByRole('button');
    for (let k = 0; k < 4; k++) {
      await left.nth(k).click();
      await right.nth(k).click();
    }
    await shot(ana, 'p4-12-jugador-emparejar');
    await shot(host, 'p4-13-host-emparejar');
  }
  if (n === 6) {
    await shot(ana, 'p4-14-jugador-deslizador');
    await send(ana).click();
  }
  if (n === 7) {
    const img = ana.locator('main [role="button"] img');
    const box = await img.boundingBox();
    await ana.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.26);
    await shot(ana, 'p4-15-jugador-pin');
    await send(ana).click();
  }
  if (n === 8) {
    await ana.getByLabel('Espacio 1').fill('oxigeno');
    await shot(ana, 'p4-16-jugador-completar');
    await send(ana).click();
  }
  if (n === 10) {
    await host.waitForTimeout(4000); // se van destapando piezas
    await shot(host, 'p4-17-host-imagen-revelada');
  }
  if (n === 12) {
    await ana.getByLabel('Palabra 1').fill('divertido');
    await ana.getByLabel('Palabra 2').fill('rápido');
    await shot(ana, 'p4-18-jugador-nube');
    await send(ana).click();
    await beto.getByLabel('Palabra 1').fill('Divertido');
    await send(beto).click();
  }
  if (n === 13) {
    await ana.getByLabel(/Escribe tu respuesta/).fill('Aprender jugando a toda velocidad');
    await send(ana).click();
    await beto.getByLabel(/Escribe tu respuesta/).fill('Juntos llegamos más lejos');
    await send(beto).click();
    await beto.getByText('¡Vota la mejor respuesta!').waitFor({ timeout: 15_000 });
    await shot(beto, 'p4-19-jugador-votar');
    await host.waitForTimeout(600);
    await shot(host, 'p4-20-host-votacion');
    await beto.getByRole('button', { name: /Aprender jugando/ }).click();
  }
  if (n === 14) {
    // Quien dibuja ve la palabra y la pizarra; el otro, el lienzo en vivo y la caja para adivinar
    const anaDraws = await ana
      .getByText('Dibuja:')
      .isVisible()
      .catch(() => false);
    const [artist, guesser] = anaDraws ? [ana, beto] : [beto, ana];
    const canvas = artist.locator('main canvas');
    const box = await canvas.boundingBox();
    await artist.mouse.move(box.x + 60, box.y + 60);
    await artist.mouse.down();
    for (let k = 0; k <= 20; k++) {
      const a = (k / 20) * Math.PI * 2;
      await artist.mouse.move(
        box.x + box.width / 2 + Math.cos(a) * 70,
        box.y + box.height / 2 + Math.sin(a) * 70,
      );
      await artist.waitForTimeout(25);
    }
    await artist.mouse.up();
    await artist.waitForTimeout(500);
    await shot(artist, 'p4-21-jugador-dibuja');
    await guesser.getByLabel('¿Qué es?').fill('luna');
    await guesser.getByRole('button', { name: 'Enviar' }).click();
    await guesser.getByText('¡Casi! Prueba otra vez').waitFor();
    await shot(guesser, 'p4-22-jugador-adivina');
    await shot(host, 'p4-23-host-dibujo');
  }

  await toReveal();
  const revealShots = {
    1: 'p4-24-host-revelar-jefe',
    4: 'p4-25-host-revelar-ordenar',
    6: 'p4-26-host-revelar-deslizador',
    7: 'p4-27-host-revelar-pin',
    12: 'p4-28-host-revelar-nube',
    13: 'p4-29-host-revelar-votos',
  };
  if (revealShots[n]) await shot(host, revealShots[n]);
  if (n === 1) {
    await ana.getByText('Tu puesto').waitFor();
    await shot(ana, 'p4-30-jugador-resultado-jefe');
  }
  if (n === 14) break;
  await host.getByRole('button', { name: 'Ver ranking' }).click();
  await host.getByRole('button', { name: 'Siguiente pregunta' }).waitFor();
  if (n === 1) {
    await host.waitForTimeout(1500);
    await shot(host, 'p4-31-host-tablero-jefe');
  }
  await host.getByRole('button', { name: 'Siguiente pregunta' }).click();
}

await host.getByRole('button', { name: /Ver podio/ }).click();
await host.getByText('¡Tenemos ganadores!').waitFor({ timeout: 10_000 });
await host.waitForTimeout(4500);
await shot(host, 'p4-32-host-podio-jefe');
await shot(screen, 'p4-33-pantalla-podio');

await browser.close();
console.log(
  errors.length
    ? `⚠️ Problemas:\n${errors.join('\n')}`
    : '✅ Fase 4 en el navegador sin errores de consola',
);
process.exit(errors.length ? 1 : 0);
