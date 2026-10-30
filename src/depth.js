export const MAX_DEPTH = 11000;

export const ZONES = [
  { name: 'Epipelágica',   from: 0,    to: 200 },
  { name: 'Mesopelágica',  from: 200,  to: 1000 },
  { name: 'Batipelágica',  from: 1000, to: 4000 },
  { name: 'Abisopelágica', from: 4000, to: 6000 },
  { name: 'Hadal',         from: 6000, to: 11000 }
];

const STOPS = [
  [0,     [24, 120, 184]],
  [200,   [10, 78, 140]],
  [1000,  [5, 38, 84]],
  [4000,  [3, 16, 40]],
  [6000,  [2, 8, 22]],
  [11000, [0, 1, 6]]
];

/** Estado compartido entre main.js (scroll) y scene.js (3D). */
export const state = { depth: 0, visual: 0 };

export function colorAt(d) {
  for (let i = 1; i < STOPS.length; i++) {
    const [d1, c1] = STOPS[i];
    if (d <= d1) {
      const [d0, c0] = STOPS[i - 1];
      const t = (d - d0) / (d1 - d0);
      return c0.map((v, k) => Math.round(v + (c1[k] - v) * t));
    }
  }
  return STOPS[STOPS.length - 1][1];
}

export function zoneAt(d) {
  return ZONES.find((z) => d < z.to) || ZONES[ZONES.length - 1];
}

/** 0..1 uniforme por zona (para que la cámara baje parejo en cada sección). */
export function visualFrom(d) {
  const z = zoneAt(d);
  const i = ZONES.indexOf(z);
  return Math.min(1, (i + (d - z.from) / (z.to - z.from)) / ZONES.length);
}
