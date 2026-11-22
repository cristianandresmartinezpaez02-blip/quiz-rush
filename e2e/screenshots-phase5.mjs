// Fase 5 en el navegador: progreso, tienda y avatar, modos individuales (Rush, práctica,
// aventura, reto diario), desafío por enlace y un duelo real entre dos jugadores.
// Uso: node e2e/screenshots-phase5.mjs [carpeta-salida]   (requiere npm run dev y db:seed)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const OUT = process.argv[2] ?? 'e2e/screenshots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--disable-gpu'] });
const errors = [];

async function open(viewport, label, email) {
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
const desktop = { width: 1440, height: 900 };

// ── Progreso y tienda (escritorio) ──
const demo = await open(desktop, 'demo', 'demo@quizrush.dev');
await demo.goto(`${BASE}/progreso`);
await demo.getByRole('heading', { name: /Misiones/ }).waitFor();
await demo.waitForTimeout(900);
await shot(demo, 'p5-01-progreso');
await demo.getByRole('heading', { name: /Logros/ }).scrollIntoViewIfNeeded();
await demo.waitForTimeout(400);
await shot(demo, 'p5-02-progreso-logros');

await demo.goto(`${BASE}/tienda`);
await demo.getByRole('tab', { name: 'Sombrero' }).click();
await demo.getByRole('button', { name: 'Corona' }).click(); // probarse una pieza bloqueada
await demo.waitForTimeout(400);
await shot(demo, 'p5-03-tienda-sombreros');
await demo.getByRole('tab', { name: 'Cuerpo' }).click();
await demo.waitForTimeout(300);
await shot(demo, 'p5-04-tienda-cuerpos');

// Menú de usuario con avatar y la pastilla de nivel/monedas de la cabecera
await demo
  .getByRole('button', { name: 'Menú' })
  .first()
  .click()
  .catch(() => {});
await demo.waitForTimeout(300);
await shot(demo, 'p5-05-cabecera-menu');
await demo.keyboard.press('Escape');

// ── Página del quiz: practicar y desafiar ──
await demo.goto(`${BASE}/biblioteca?q=animales`);
await demo
  .getByRole('link', { name: /^Animales asombrosos/ })
  .first()
  .click();
await demo.waitForURL('**/quiz/**');
await demo.getByRole('button', { name: 'Desafiar' }).click();
await demo.getByRole('button', { name: 'Crear desafío' }).last().click();
await demo.getByText('¡Listo! Comparte el enlace').waitFor();
await shot(demo, 'p5-06-crear-desafio');
const challengeUrl = await demo.locator('dialog input[readonly]').inputValue();
await demo.keyboard.press('Escape');

// Práctica: responder y ver la solución
await demo.getByRole('button', { name: 'Practicar' }).click();
await demo.waitForURL('**/solo/**');
await demo.locator('main button.min-h-28').first().waitFor();
await shot(demo, 'p5-07-practica-pregunta');
await demo.locator('main button.min-h-28').first().click();
await demo.getByText('La respuesta').waitFor();
await demo.waitForTimeout(500);
await shot(demo, 'p5-08-practica-solucion');

// ── Aventura ──
await demo.goto(`${BASE}/aventura`);
await demo.getByRole('heading', { name: /Bosque de la Ciencia/ }).waitFor();
await shot(demo, 'p5-09-aventura-mapa');

// ── Jugador en el celular: menú de modos, Rush y resumen ──
const sofi = await open(phone, 'sofi', 'sofi@quizrush.dev');
await sofi.goto(`${BASE}/solo`);
await sofi.getByRole('heading', { name: 'Rush', exact: true }).waitFor();
await shot(sofi, 'p5-10-modos-celular');
await sofi
  .locator('section')
  .filter({ has: sofi.getByRole('heading', { name: 'Rush', exact: true }) })
  .getByRole('button', { name: 'Jugar' })
  .click();
await sofi.waitForURL('**/solo/**');
for (let i = 0; i < 6; i++) {
  const btn = sofi.locator('main button.min-h-28').first();
  await btn.waitFor({ timeout: 10_000 });
  if (i === 3) await shot(sofi, 'p5-11-rush-celular');
  await btn.click();
  await sofi.waitForTimeout(350);
}
await sofi.getByRole('button', { name: 'Terminar ahora' }).click();
await sofi.getByText('Partida terminada').waitFor({ timeout: 15_000 });
await sofi.waitForTimeout(1800);
await shot(sofi, 'p5-12-rush-resumen');

// Desafío por enlace (otra persona)
await sofi.goto(challengeUrl);
await sofi.getByRole('button', { name: 'Aceptar el desafío' }).waitFor();
await shot(sofi, 'p5-13-desafio-celular');

// Reto diario
await sofi.goto(`${BASE}/reto-diario`);
await sofi.getByRole('heading', { name: /Ranking de hoy/ }).waitFor();
await shot(sofi, 'p5-14-reto-diario');

// ── Duelo real: demo (escritorio) contra sofi (celular) ──
await demo.goto(`${BASE}/duelo`);
await sofi.goto(`${BASE}/duelo`);
await demo.getByRole('button', { name: 'Buscar rival' }).click();
await demo.getByText('Buscando rival…').waitFor();
await shot(demo, 'p5-15-duelo-buscando');
await sofi.getByRole('button', { name: 'Buscar rival' }).click();
await demo.getByText(/¡Prepárate!/).waitFor({ timeout: 15_000 });
await shot(sofi, 'p5-16-duelo-cuenta-atras');
// Primera pregunta: sofi congela a demo
await sofi.getByRole('button', { name: 'Congelar' }).waitFor({ timeout: 10_000 });
await sofi.getByRole('button', { name: 'Congelar' }).click();
await demo.getByText(/¡Congelado!/).waitFor();
await shot(demo, 'p5-17-duelo-congelado');
await shot(sofi, 'p5-18-duelo-pregunta-celular');
await sofi.locator('main button.min-h-28').first().click();
await demo.waitForTimeout(3200);
await demo.locator('main button.min-h-28').first().click();
await demo.getByText('Rival:').waitFor({ timeout: 10_000 });
await shot(demo, 'p5-19-duelo-revelar');
// Resto: ambos responden la primera opción
for (let i = 1; i < 7; i++) {
  await demo.locator('main button.min-h-28').first().waitFor({ timeout: 15_000 });
  await demo.locator('main button.min-h-28').first().click();
  await sofi.locator('main button.min-h-28').first().waitFor({ timeout: 15_000 });
  await sofi.locator('main button.min-h-28').first().click();
}
await demo.getByRole('button', { name: 'Otro duelo' }).waitFor({ timeout: 30_000 });
await demo.waitForTimeout(2500);
await shot(demo, 'p5-20-duelo-final');
await shot(sofi, 'p5-21-duelo-final-celular');

// Perfil público con avatar y logros
await demo.goto(`${BASE}/perfil/demo`);
await demo.waitForTimeout(500);
await shot(demo, 'p5-22-perfil');

await browser.close();
console.log(
  errors.length
    ? `⚠️ Problemas:\n${errors.join('\n')}`
    : '✅ Fase 5 en el navegador sin errores de consola',
);
process.exit(errors.length ? 1 : 0);
