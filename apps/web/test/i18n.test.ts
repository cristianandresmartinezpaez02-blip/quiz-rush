// Los dos idiomas deben tener exactamente las mismas claves (ningún texto sin traducir).
import { describe, expect, it } from 'vitest';
import en from '../messages/en.json';
import es from '../messages/es.json';

function keys(obj: unknown, prefix = ''): string[] {
  if (!obj || typeof obj !== 'object') return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe('traducciones', () => {
  it('español e inglés tienen las mismas claves', () => {
    const esKeys = new Set(keys(es));
    const enKeys = new Set(keys(en));
    expect([...esKeys].filter((k) => !enKeys.has(k))).toEqual([]);
    expect([...enKeys].filter((k) => !esKeys.has(k))).toEqual([]);
  });

  it('hay textos para todos los modos, equipos y power-ups', () => {
    for (const m of ['CLASSIC', 'TEAMS', 'SURVIVAL', 'RACE', 'BOSS', 'TOURNAMENT', 'TERRITORY'])
      expect(es.game.modes[m as keyof typeof es.game.modes].name).toBeTruthy();
    for (const p of ['fifty', 'double', 'time', 'shield', 'second', 'hint'])
      expect(es.game.powerUps[p as keyof typeof es.game.powerUps]).toBeTruthy();
  });
});
