// Genera los iconos PNG de la app instalable (PWA) a partir del logo SVG:
//  • icon-192 / icon-512: el logo tal cual (fondo transparente)
//  • maskable-512: logo centrado con margen de seguridad sobre fondo oscuro (Android lo recorta)
//  • apple-touch-icon (180): iOS no admite transparencia
// Uso: node scripts/generate-pwa-icons.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import sharp from 'sharp';

const SVG = readFileSync('apps/web/public/icon.svg');
const OUT = 'apps/web/public/icons';
const BG = '#0e0b26';
mkdirSync(OUT, { recursive: true });

async function plain(size, name) {
  await sharp(SVG, { density: 1024 }).resize(size, size).png().toFile(`${OUT}/${name}.png`);
}

async function padded(size, name, logoRatio) {
  const logo = await sharp(SVG, { density: 1024 })
    .resize(Math.round(size * logoRatio), Math.round(size * logoRatio))
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(`${OUT}/${name}.png`);
}

await plain(192, 'icon-192');
await plain(512, 'icon-512');
// Zona segura de los iconos "maskable": círculo del 80 % → el logo ocupa el 60 %
await padded(512, 'maskable-512', 0.6);
await padded(180, 'apple-touch-icon', 0.78);
// Icono pequeño para la insignia de las notificaciones (Android la pinta en blanco)
await plain(96, 'badge-96');
console.log('✓ Iconos PWA generados en', OUT);
