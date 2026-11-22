// Flujo real de la Fase 2 en el navegador (Playwright) + capturas para revisión visual.
// Uso: node e2e/screenshots-phase2.mjs [carpeta-salida]   (requiere npm run dev y db:seed)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const OUT = process.argv[2] ?? 'e2e/screenshots';
mkdirSync(OUT, { recursive: true });

// Sin GPU: evita fallos intermitentes de captura de Chromium headless en Windows
const browser = await chromium.launch({ args: ['--disable-gpu'] });
const errors = [];
const fail = (msg) => errors.push(msg);

async function newPage(viewport, scheme = 'dark') {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme, locale: 'es-CO' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    // El aviso de hidratación por "caret-color" lo inyecta Chromium en campos de contraseña
    if (m.type() === 'error' && !m.text().includes('caret-color'))
      fail(`console: ${m.text().slice(0, 200)}`);
  });
  return { ctx, page };
}

const desktop = { width: 1440, height: 900 };

/** Captura con animaciones congeladas (las infinitas, como el rayo del logo, pueden bloquearla). */
async function shot(page, opts) {
  console.log('📸', opts.path.split('/').pop());
  for (let attempt = 1; ; attempt++) {
    try {
      await page.screenshot({ animations: 'disabled', timeout: 60_000, ...opts });
      return;
    } catch (err) {
      if (attempt >= 3) throw err;
      await page.waitForTimeout(500);
    }
  }
}

// Visitante anónimo: biblioteca
{
  const { page, ctx } = await newPage(desktop);
  await page.goto(`${BASE}/biblioteca`);
  await page.getByRole('heading', { name: 'En tendencia' }).waitFor();
  await page.waitForTimeout(800);
  await shot(page, { path: `${OUT}/p2-01-biblioteca.png` });
  // Segunda pantalla de la biblioteca (la captura fullPage falla en Chromium headless de Windows)
  await page.mouse.wheel(0, 1300);
  await page.waitForTimeout(600);
  await shot(page, { path: `${OUT}/p2-02-biblioteca-secciones.png` });
  await page.mouse.wheel(0, -5000);
  await page.waitForTimeout(300);

  // Vista previa al pasar el ratón
  const card = page.locator('article').nth(1);
  await card.hover();
  await page.waitForTimeout(400);
  await card.screenshot({
    animations: 'disabled',
    timeout: 60_000,
    path: `${OUT}/p2-03-tarjeta-hover.png`,
  });

  // Búsqueda instantánea con un error de escritura
  await page.getByPlaceholder('Busca quizzes, temas o etiquetas…').fill('istoria latinoamerica');
  // Espera a que la URL refleje la búsqueda y a que aparezca el resultado en la cuadrícula
  await page
    .waitForURL(/q=istoria/, { timeout: 8000 })
    .catch(() => fail('La URL no refleja la búsqueda'));
  await page.locator('section[aria-live] article').first().waitFor({ timeout: 8000 });
  const firstResult = await page.locator('section[aria-live] article h3').first().textContent();
  if (firstResult !== 'Historia de Latinoamérica')
    fail(`Primer resultado inesperado: ${firstResult}`);
  await shot(page, { path: `${OUT}/p2-04-busqueda.png` });

  // Filtro por categoría con chip
  await page.getByPlaceholder('Busca quizzes, temas o etiquetas…').fill('');
  await page.getByRole('button', { name: /Cine y TV/ }).click();
  await page.getByText('Clásicos del cine').first().waitFor({ timeout: 8000 });
  await shot(page, { path: `${OUT}/p2-05-filtro-categoria.png` });
  await ctx.close();
}

// Usuario con cuenta: quiz, favorito, calificación, compartir, comentarios, notificaciones
{
  const { page, ctx } = await newPage(desktop);
  await page.goto(`${BASE}/entrar`);
  await page.getByLabel('Correo electrónico').fill('sofi@quizrush.dev');
  await page.getByLabel('Contraseña').fill('QuizRush123!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/mis-quizzes');

  await page.goto(`${BASE}/biblioteca?q=tech`);
  await page
    .getByRole('link', { name: /^Tech & Internet Trivia/ })
    .first()
    .click();
  await page.waitForURL('**/quiz/**');
  await page.getByRole('heading', { name: 'Tech & Internet Trivia' }).waitFor();
  await page.waitForTimeout(800);
  await shot(page, { path: `${OUT}/p2-06-quiz.png` });

  // Favorito (alternar dos veces deja el estado como estaba)
  const favBtn = page
    .locator('button[aria-pressed]')
    .filter({ has: page.locator('svg.lucide-heart') })
    .first();
  // Espera a que se conozca el estado personal (el botón está deshabilitado mientras tanto)
  await page.waitForFunction((el) => el && !el.disabled, await favBtn.elementHandle());
  const before = await favBtn.getAttribute('aria-pressed');
  await favBtn.click();
  await page.waitForTimeout(600);
  if ((await favBtn.getAttribute('aria-pressed')) === before)
    fail('El botón de favorito no cambió');
  await favBtn.click();

  // Calificar
  await page.getByRole('radio', { name: '4 estrellas' }).click();
  await page.getByText(/Gracias por calificar/).waitFor({ timeout: 5000 });

  // Compartir
  await page.getByRole('button', { name: 'Compartir' }).click();
  await page.getByText('Descargar QR').waitFor();
  await page.waitForTimeout(300);
  await shot(page, { path: `${OUT}/p2-07-compartir.png` });
  await page.keyboard.press('Escape');

  // Comentarios
  await page.locator('#comentarios').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await shot(page, { path: `${OUT}/p2-08-comentarios.png` });

  // Notificaciones
  await page.getByRole('button', { name: /Notificaciones/ }).click();
  await page.waitForTimeout(400);
  await shot(page, { path: `${OUT}/p2-09-notificaciones.png` });
  await page.keyboard.press('Escape');

  await page.goto(`${BASE}/guardados`);
  await page.waitForTimeout(500);
  await shot(page, { path: `${OUT}/p2-10-guardados.png` });

  await page.goto(`${BASE}/perfil/trivia_queen`);
  await page.waitForTimeout(500);
  await shot(page, { path: `${OUT}/p2-11-perfil-creador.png` });
  await ctx.close();
}

// Celular y tema claro
{
  const { page, ctx } = await newPage({ width: 390, height: 844 });
  await page.goto(`${BASE}/biblioteca`);
  await page.getByRole('heading', { name: 'En tendencia' }).waitFor();
  await page.waitForTimeout(600);
  await shot(page, { path: `${OUT}/p2-12-movil-biblioteca.png` });
  const firstQuiz = await page.locator('article a').first().getAttribute('href');
  await page.goto(`${BASE}${firstQuiz}`);
  await page.waitForTimeout(800);
  await shot(page, { path: `${OUT}/p2-13-movil-quiz.png` });
  await ctx.close();
}
{
  const { page, ctx } = await newPage(desktop, 'light');
  await page.goto(`${BASE}/biblioteca`);
  await page.evaluate(() => localStorage.setItem('theme', 'light'));
  await page.reload();
  await page.getByRole('heading', { name: 'En tendencia' }).waitFor();
  await page.waitForTimeout(600);
  await shot(page, { path: `${OUT}/p2-14-biblioteca-clara.png` });
  await ctx.close();
}

await browser.close();
console.log(
  errors.length
    ? `⚠️ Problemas:\n${errors.join('\n')}`
    : '✅ Flujo completo sin errores de consola',
);
process.exit(errors.length ? 1 : 0);
