// Fase 6 en el navegador: crear con IA (modo simulado), plantillas, importar, ayudas de IA en el
// editor, clases (profe y estudiante), tarea jugada, certificado e informes.
// Uso: node e2e/screenshots-phase6.mjs [carpeta-salida]   (requiere AI_MOCK=1 npm run dev y db:seed)
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
  await page.goto(`${BASE}/entrar`);
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill('QuizRush123!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/mis-quizzes');
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

const phone = { width: 390, height: 844 };
const desktop = { width: 1440, height: 900 };

try {
  // ── Profe en escritorio: crear contenido ──
  const demo = await open(desktop, 'demo', 'demo@quizrush.dev');
  await shot(demo, 'p6-01-mis-quizzes');

  await demo.getByRole('button', { name: 'Desde plantilla' }).click();
  await demo.getByRole('dialog').waitFor();
  await shot(demo, 'p6-02-plantillas');
  await demo.keyboard.press('Escape');

  await demo.getByRole('button', { name: 'Importar' }).click();
  await demo.getByRole('dialog').waitFor();
  await shot(demo, 'p6-03-importar');
  await demo.keyboard.press('Escape');

  await demo.goto(`${BASE}/crear/ia`);
  await demo.waitForLoadState('networkidle');
  await demo.getByRole('textbox', { name: 'Tema' }).fill('Los volcanes');
  await shot(demo, 'p6-04-crear-ia');
  await demo.getByRole('button', { name: 'Generar quiz' }).click();
  await demo.waitForURL(/\/crear\/(?!ia)[a-z0-9]+/, { timeout: 60_000 });
  await demo.waitForLoadState('networkidle');
  await shot(demo, 'p6-05-editor-generado');
  const generatedId = new URL(demo.url()).pathname.split('/').pop();
  const suggest = demo.getByRole('button', { name: /Sugerir opciones incorrectas/ });
  if ((await suggest.count()) && (await suggest.first().isEnabled())) {
    await suggest.first().click();
    await demo.waitForTimeout(1200);
    await shot(demo, 'p6-06-editor-distractores');
  }

  // ── Clase y tarea (por API, con la sesión del navegador) ──
  const cls = await (
    await demo.request.post(`${BASE}/api/classes`, {
      data: { name: 'Geografía 2.º A' },
      headers: { origin: BASE },
    })
  ).json();
  const mine = await (await demo.request.get(`${BASE}/api/quizzes`)).json();
  const quiz = mine.items.find((q) => q.status === 'PUBLISHED' && q.questionCount >= 3);
  await demo.goto(`${BASE}/clases/${cls.id}`);
  await demo.waitForLoadState('networkidle');
  await demo.getByRole('button', { name: 'Nueva tarea' }).click();
  await demo.getByRole('dialog').waitFor();
  await demo
    .getByRole('button', {
      name: new RegExp(quiz.title.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    })
    .first()
    .click();
  await demo.getByRole('slider').press('Home');
  await shot(demo, 'p6-07-nueva-tarea');
  await demo.getByRole('button', { name: 'Crear tarea' }).click();
  await demo.getByRole('dialog').waitFor({ state: 'hidden' });
  await shot(demo, 'p6-08-clase-profe');

  // ── Estudiante en el móvil ──
  const sofi = await open(phone, 'sofi', 'sofi@quizrush.dev');
  await sofi.goto(`${BASE}/clases`);
  await sofi.waitForLoadState('networkidle');
  await sofi.getByLabel('Código de clase').fill(cls.joinCode);
  await shot(sofi, 'p6-09-unirse-movil');
  await sofi.getByRole('button', { name: 'Unirme' }).click();
  await sofi.waitForURL(`**/clases/${cls.id}`);
  await sofi.waitForLoadState('networkidle');
  await shot(sofi, 'p6-10-clase-estudiante');
  await sofi.getByRole('button', { name: 'Empezar' }).first().click();
  await sofi.waitForURL('**/solo/**', { timeout: 30_000 });
  await sofi.waitForTimeout(1500);
  await shot(sofi, 'p6-11a-tarea-pregunta');
  await sofi.getByRole('button', { name: 'Terminar ahora' }).click();
  await sofi.getByText(/Tarea aprobada|para aprobar/).waitFor({ timeout: 20_000 });
  await shot(sofi, 'p6-11-resultado-tarea');

  // ── Informes ──
  const report = await (await demo.request.get(`${BASE}/api/classes/${cls.id}`)).json();
  const aid = report.assignments[0].id;
  await demo.goto(`${BASE}/clases/${cls.id}/tareas/${aid}`);
  await demo.waitForLoadState('networkidle');
  await shot(demo, 'p6-12-informe-tarea');
  await demo.goto(`${BASE}/informes`);
  await demo.waitForLoadState('networkidle');
  await shot(demo, 'p6-13-informes');
  const gameLink = demo.locator('a[href^="/informes/partida/"]').first();
  if (await gameLink.count()) {
    await gameLink.click();
    await demo.waitForLoadState('networkidle');
    await shot(demo, 'p6-14-informe-partida');
  }
  const cert = await sofi
    .locator('a[href^="/certificado/"]')
    .first()
    .getAttribute('href')
    .catch(() => null);
  if (cert) {
    await sofi.goto(BASE + cert);
    await sofi.waitForLoadState('networkidle');
    await shot(sofi, 'p6-15-certificado-movil');
    await demo.goto(BASE + cert);
    await demo.waitForLoadState('networkidle');
    await shot(demo, 'p6-16-certificado');
  }
  // Limpieza: el quiz generado era solo para la captura
  await demo.request.delete(`${BASE}/api/quizzes/${generatedId}`, { headers: { origin: BASE } });
} catch (err) {
  errors.push(`💥 ${err.message}`);
}

await browser.close();
console.log(
  errors.length
    ? `\n⚠️ ${errors.length} errores:\n${errors.join('\n')}`
    : '\n✅ Sin errores en consola',
);
