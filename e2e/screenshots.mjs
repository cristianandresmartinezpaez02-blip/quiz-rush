// Capturas de las pantallas principales (revisión visual) + flujo real del editor en el navegador.
// Uso: node e2e/screenshots.mjs [carpeta-salida]   (requiere npm run dev en marcha)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const OUT = process.argv[2] ?? 'e2e/screenshots';
mkdirSync(OUT, { recursive: true });

// Sin GPU: evita fallos intermitentes de captura de Chromium headless en Windows
const browser = await chromium.launch({ args: ['--disable-gpu'] });
const errors = [];

async function newPage(viewport, scheme = 'dark') {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme, locale: 'es-CO' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  // El aviso de hidratación por "caret-color" lo inyecta Chromium en campos de contraseña
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('caret-color'))
      errors.push(`console: ${m.text()}`);
  });
  return { ctx, page };
}

const desktop = { width: 1440, height: 900 };
const mobile = { width: 390, height: 844 };

// Portada y login
{
  const { page, ctx } = await newPage(desktop);
  await page.goto(BASE);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/01-inicio-oscuro.png` });
  await page.goto(`${BASE}/entrar`);
  await page.screenshot({ path: `${OUT}/02-entrar.png` });
  await ctx.close();
}
{
  const { page, ctx } = await newPage(desktop, 'light');
  await page.goto(BASE);
  await page.evaluate(() => localStorage.setItem('theme', 'light'));
  await page.reload();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/03-inicio-claro.png` });
  await ctx.close();
}

// Flujo completo con la cuenta demo
{
  const { page, ctx } = await newPage(desktop);
  await page.goto(`${BASE}/entrar`);
  await page.getByLabel('Correo electrónico').fill('demo@quizrush.dev');
  await page.getByLabel('Contraseña').fill('QuizRush123!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/mis-quizzes');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/04-mis-quizzes.png` });

  // Crear un quiz nuevo y editarlo en el navegador
  await page
    .getByRole('button', { name: /Nuevo quiz/ })
    .first()
    .click();
  await page.waitForURL('**/crear/**');
  await page.locator('#quiz-title').waitFor();
  await page.screenshot({ path: `${OUT}/05-editor-vacio.png` });

  await page.locator('#quiz-title').fill('Animales increíbles');
  await page.locator('#q-prompt').fill('¿Cuál es el animal terrestre más rápido?');
  const options = page.getByPlaceholder(/^Opción \d$/);
  for (const [i, text] of ['Guepardo', 'León', 'Caballo', 'Avestruz'].entries()) {
    await options.nth(i).fill(text);
  }
  // Esperar al autoguardado + publicación automática
  await page.getByText('¡Tu quiz ya está en la Biblioteca General!').waitFor({ timeout: 10_000 });
  await page.getByRole('status').getByText('Guardado').waitFor({ timeout: 10_000 });
  await page.screenshot({ path: `${OUT}/06-editor-publicado.png` });

  // Duplicar (bug corregido) y añadir una pregunta de respuesta escrita
  await page.getByRole('button', { name: 'Duplicar pregunta' }).first().click();
  await page.getByRole('button', { name: 'Nueva pregunta' }).first().click();
  await page.getByRole('button', { name: /Respuesta escrita/ }).click();
  await page.locator('#q-prompt').fill('¿Cómo se llama la cría del caballo?');
  await page.getByPlaceholder('Respuesta aceptada').first().fill('Potro');
  await page.getByRole('tab', { name: 'Quiz' }).click();
  await page.getByRole('button', { name: 'Selva' }).click();
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${OUT}/07-editor-respuesta-escrita-selva.png` });

  // Recargar: nada se pierde
  await page.reload();
  await page.locator('#quiz-title').waitFor();
  const title = await page.locator('#quiz-title').inputValue();
  const count = await page.locator('aside ol > li').count();
  console.log(`Tras recargar → título="${title}", preguntas=${count}`);
  if (title !== 'Animales increíbles' || count !== 3)
    errors.push('El editor perdió datos al recargar');
  // Cada enunciado debe estar en su pregunta (regresión: texto escrito durante la transición)
  const expected = [
    '¿Cuál es el animal terrestre más rápido?',
    '¿Cuál es el animal terrestre más rápido?',
    '¿Cómo se llama la cría del caballo?',
  ];
  for (const [i, prompt] of expected.entries()) {
    await page.locator('aside ol > li').nth(i).locator('button').first().click();
    const value = await page.locator('#q-prompt').inputValue();
    if (value !== prompt) errors.push(`Pregunta ${i + 1}: esperaba "${prompt}" y hay "${value}"`);
  }

  await page.getByRole('button', { name: 'Versiones' }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/08-versiones.png` });
  await page.keyboard.press('Escape');

  // Limpieza: borrar el quiz de prueba para no ensuciar la cuenta demo
  const quizId = new URL(page.url()).pathname.split('/').pop();
  await page.evaluate((id) => fetch(`/api/quizzes/${id}`, { method: 'DELETE' }), quizId);

  await page.goto(`${BASE}/perfil/demo`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/09-perfil.png` });
  await ctx.close();
}

// Celular
{
  const { page, ctx } = await newPage(mobile);
  await page.goto(BASE);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/10-movil-inicio.png`, fullPage: true });
  await page.goto(`${BASE}/entrar`);
  await page.getByRole('button', { name: 'Jugar como invitado' }).click();
  await page.waitForURL('**/mis-quizzes');
  await page
    .getByRole('button', { name: /Nuevo quiz/ })
    .first()
    .click();
  await page.waitForURL('**/crear/**');
  await page.locator('#quiz-title').waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/11-movil-editor.png` });
  await ctx.close();
}

await browser.close();
console.log(
  errors.length ? `⚠️ Errores en el navegador:\n${errors.join('\n')}` : '✅ Sin errores de consola',
);
