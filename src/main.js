import './style.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ZONES, MAX_DEPTH, state, colorAt, zoneAt, visualFrom } from './depth.js';
import { el } from './dom.js';
import { initCreatures } from './creatures.js';
import { initBlog } from './blog.js';

gsap.registerPlugin(ScrollTrigger);

const root = document.documentElement;
const $ = (s) => document.querySelector(s);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Contenido dinámico ---------- */
initCreatures(reduce);
initBlog();
$('#year').textContent = new Date().getFullYear();

/* ---------- Indicador de profundidad + color del mar ---------- */
const sea = $('#sea');
const meter = $('#meter');
const nEl = $('#depth-n');
const zEl = $('#depth-zone');
const track = meter.querySelector('.meter__track');
const zoneEls = [...document.querySelectorAll('.zone')];

ZONES.slice(1).forEach((z) => {
  const tick = el('span', { class: 'meter__tick' });
  tick.style.top = (z.from / MAX_DEPTH) * 100 + '%';
  track.append(tick);
});

const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');

let anchors = [{ y: 0, d: 0 }];
function measure() {
  const sy = scrollY;
  anchors = [{ y: 0, d: 0 }];
  zoneEls.forEach((z, i) => {
    anchors.push({ y: z.getBoundingClientRect().top + sy, d: ZONES[i].from });
  });
  const last = zoneEls[zoneEls.length - 1].getBoundingClientRect();
  anchors.push({ y: last.bottom + sy, d: MAX_DEPTH });
}

function depthAt(y) {
  if (y <= anchors[0].y) return 0;
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1];
    const b = anchors[i];
    if (y <= b.y) return a.d + (b.d - a.d) * ((y - a.y) / Math.max(1, b.y - a.y));
  }
  return MAX_DEPTH;
}

let lastRead = -1;
let lastZone = '';
function update() {
  const d = depthAt(scrollY + innerHeight * 0.5);
  state.depth = d;
  state.visual = visualFrom(d);
  const [r, g, b] = colorAt(d);
  sea.style.backgroundColor = `rgb(${r},${g},${b})`;
  meter.style.setProperty('--p', (d / MAX_DEPTH).toFixed(4));
  const rd = Math.round(d / 10) * 10;
  if (rd !== lastRead) { lastRead = rd; nEl.textContent = fmt(rd); }
  const zn = zoneAt(d).name;
  if (zn !== lastZone) { lastZone = zn; zEl.textContent = zn; }
}

ScrollTrigger.create({
  trigger: document.body,
  start: 'top top',
  end: 'bottom bottom',
  onUpdate: update,
  onRefresh: () => { measure(); update(); }
});
measure();
update();
document.fonts?.ready.then(() => ScrollTrigger.refresh());

let layoutTimer;
addEventListener('abismo:layout', () => {
  clearTimeout(layoutTimer);
  layoutTimer = setTimeout(() => ScrollTrigger.refresh(), 60);
});

/* ---------- Animaciones (solo sin prefers-reduced-motion) ---------- */
const mm = gsap.matchMedia();

mm.add('(prefers-reduced-motion: no-preference)', () => {
  document.querySelectorAll('.zone, .sec').forEach((sec) => {
    const items = sec.querySelectorAll('[data-reveal]');
    if (!items.length) return;
    gsap.from(items, {
      y: 48, opacity: 0, duration: 1.1, ease: 'power3.out', stagger: 0.12,
      scrollTrigger: { trigger: sec, start: 'top 65%', once: true }
    });
  });

  const cards = gsap.utils.toArray('[data-card]');
  gsap.set(cards, { opacity: 0, y: 40 });
  ScrollTrigger.batch(cards, {
    start: 'top 90%',
    once: true,
    onEnter: (batch) => gsap.to(batch, {
      opacity: 1, y: 0, duration: 0.9, stagger: 0.09, ease: 'power3.out', overwrite: true
    })
  });
});

/* Cursor personalizado: solo desktop con puntero fino; el cursor nativo se mantiene. */
mm.add('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)', () => {
  const c = $('#cursor');
  c.hidden = false;
  const xTo = gsap.quickTo(c, 'x', { duration: 0.35, ease: 'power3' });
  const yTo = gsap.quickTo(c, 'y', { duration: 0.35, ease: 'power3' });
  const move = (e) => { xTo(e.clientX); yTo(e.clientY); };
  const over = (e) => c.classList.toggle('is-hot', !!e.target.closest('a, button, .card'));
  addEventListener('pointermove', move, { passive: true });
  addEventListener('pointerover', over, { passive: true });
  return () => {
    c.hidden = true;
    removeEventListener('pointermove', move);
    removeEventListener('pointerover', over);
  };
});

/* ---------- Escena 3D: diferida y con fallback ---------- */
function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch { return false; }
}

if (!hasWebGL()) {
  root.classList.add('no-webgl');
} else {
  const go = () => import('./scene.js')
    .then((m) => m.initScene($('#bg')))
    .catch(() => root.classList.add('no-webgl'));
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 2000 });
    else setTimeout(go, 300);
  }));
}
