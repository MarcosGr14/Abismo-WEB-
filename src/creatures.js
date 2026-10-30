import { el } from './dom.js';

const TTL = 6 * 60 * 60 * 1000; // 6 h
const KEY = 'abismo:c:v2:';

const LIST = [
  {
    key: 'viperfish', es: 'Pez víbora', latin: 'Chauliodus sloani', depth: '≈ 200–1 500 m', titleEs: 'Chauliodus sloani', titleEn: 'Viperfish',
    fallback: 'Depredador de colmillos largos y transparentes que usa fotóforos en el cuerpo y un señuelo luminoso para atraer a sus presas.',
    facts: [
      ['Tamaño', 'Unos 20–35 cm'],
      ['Alimentación', 'Peces pequeños y crustáceos'],
      ['Adaptación', 'Fotóforos a lo largo del vientre y un señuelo luminoso en la aleta dorsal. Sube a aguas más someras de noche y baja de día.'],
      ['Dato curioso', 'Sus colmillos son tan largos que no caben dentro de la boca cerrada.']
    ]
  },
  {
    key: 'lanternfish', es: 'Pez linterna', latin: 'Myctophidae', depth: '≈ 300–1 200 m', titleEs: 'Myctophidae', titleEn: 'Lanternfish',
    fallback: 'Pequeños peces con fotóforos en el vientre y los costados. Protagonizan la mayor migración vertical diaria del planeta.',
    facts: [
      ['Tamaño', 'De 2 a 30 cm; la mayoría mide menos de 15 cm'],
      ['Alimentación', 'Zooplancton, sobre todo copépodos'],
      ['Adaptación', 'Fotóforos en vientre y flancos que borran su silueta vista desde abajo (contrailuminación). Cada especie tiene su propio patrón de luces.'],
      ['Dato curioso', 'Hay más de 250 especies y forman una parte enorme de los peces del mar profundo.']
    ]
  },
  {
    key: 'vampire', es: 'Calamar vampiro', latin: 'Vampyroteuthis infernalis', depth: '≈ 600–1 200 m', titleEs: 'Vampyroteuthis infernalis', titleEn: 'Vampire_squid',
    fallback: 'Cefalópodo de ojos enormes y membrana entre los brazos que vive en aguas con muy poco oxígeno y se alimenta de nieve marina.',
    facts: [
      ['Tamaño', 'Hasta unos 30 cm'],
      ['Alimentación', 'Nieve marina: restos orgánicos que atrapa con dos filamentos retráctiles'],
      ['Adaptación', 'Vive en la zona de mínimo oxígeno. En lugar de tinta, suelta una nube de mucosidad luminosa.'],
      ['Dato curioso', 'No es un calamar ni un pulpo: es el único miembro vivo de su propio orden.']
    ]
  },
  {
    key: 'dumbo', es: 'Pulpo Dumbo', latin: 'Grimpoteuthis', depth: '≈ 300–4 000 m', titleEs: 'Grimpoteuthis', titleEn: 'Dumbo_octopus',
    fallback: 'Pulpo que «vuela» batiendo dos aletas con forma de orejas cerca del fondo marino, donde caza pequeños crustáceos y gusanos.',
    facts: [
      ['Tamaño', 'Normalmente 20–30 cm; se han registrado ejemplares de hasta 1,8 m'],
      ['Alimentación', 'Copépodos, isópodos y gusanos, que traga enteros'],
      ['Adaptación', 'Dos aletas en forma de orejas para «volar» sobre el fondo. No tiene bolsa de tinta.'],
      ['Dato curioso', 'Se ha filmado uno a casi 7 000 m, entre los pulpos más profundos documentados.']
    ]
  },
  {
    key: 'angler', es: 'Pez pescador abisal', latin: 'Lophiiformes', depth: '≈ 1 000–3 000 m', titleEs: 'Lophiiformes', titleEn: 'Anglerfish',
    fallback: 'Cuelga un señuelo luminoso frente a su enorme boca, a menudo iluminado por bacterias simbióticas, para atraer presas en la oscuridad.',
    facts: [
      ['Tamaño', 'Las hembras van de unos pocos cm a más de 1 m según la especie; los machos son mucho menores'],
      ['Alimentación', 'Peces y crustáceos, a veces más grandes que ella'],
      ['Adaptación', 'Un señuelo (esca) en la punta de una espina de la cabeza, iluminado por bacterias luminosas.'],
      ['Dato curioso', 'En muchas especies el macho, diminuto, se fusiona con la hembra y vive como parásito sexual.']
    ]
  },
  {
    key: 'pelican', es: 'Anguila pelícano', latin: 'Eurypharynx pelecanoides', depth: '≈ 500–3 000 m', titleEs: 'Eurypharynx pelecanoides', titleEn: 'Pelican_eel',
    fallback: 'Anguila de boca desproporcionada, capaz de engullir presas grandes, con una cola larga que termina en un pequeño órgano luminoso.',
    facts: [
      ['Tamaño', 'Hasta cerca de 1 m'],
      ['Alimentación', 'Crustáceos pequeños y plancton; a veces peces'],
      ['Adaptación', 'Boca enorme y flexible, con la mandíbula inferior como una bolsa. La cola termina en un órgano luminoso.'],
      ['Dato curioso', 'En inglés se la llama «gulper eel»: anguila tragona.']
    ]
  }
];

/* ---------- Caché en sessionStorage con TTL ---------- */
function readCache(k) {
  try {
    const raw = sessionStorage.getItem(KEY + k);
    if (!raw) return null;
    const { t, d } = JSON.parse(raw);
    return Date.now() - t < TTL ? d : null;
  } catch { return null; }
}
function writeCache(k, d) {
  try { sessionStorage.setItem(KEY + k, JSON.stringify({ t: Date.now(), d })); } catch { /* lleno o bloqueado */ }
}

/* ---------- Utilidades ---------- */
function shorten(s, max) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const i = cut.lastIndexOf('. ');
  return i > 80 ? cut.slice(0, i + 1) : cut.replace(/\s+\S*$/, '') + '…';
}
const safeImg = (u) => {
  try { const x = new URL(u); return x.protocol === 'https:' && x.hostname === 'upload.wikimedia.org' ? x.href : ''; } catch { return ''; }
};
const safePage = (u) => {
  try { const x = new URL(u); return x.protocol === 'https:' && /^(es|en)\.wikipedia\.org$/.test(x.hostname) ? x.href : ''; } catch { return ''; }
};
/* Pide la misma miniatura de Wikimedia en un ancho estándar mayor (si falla, se usa la pequeña). */
const bigImg = (u) => u.replace(/\/\d+px-([^/]+)$/, '/500px-$1');

async function fetchSummary(c) {
  const cached = readCache(c.key);
  if (cached) return cached;
  for (const [lang, title] of [['es', c.titleEs], ['en', c.titleEn]]) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 7000);
    try {
      const r = await fetch(
        `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}?redirect=true`,
        { signal: ctl.signal }
      );
      if (!r.ok) continue;
      const j = await r.json();
      if (j.type === 'disambiguation' || !j.extract) continue;
      const full = String(j.extract);
      const data = {
        extract: shorten(full, 230),
        full: shorten(full, 560),
        image: safeImg(j.thumbnail?.source || ''),
        url: safePage(j.content_urls?.desktop?.page || '')
      };
      writeCache(c.key, data);
      return data;
    } catch { /* prueba siguiente idioma */ } finally { clearTimeout(timer); }
  }
  return null;
}

/* ---------- Ficha (diálogo modal nativo) ---------- */
function renderFicha(dlg, ref) {
  const { c, data } = ref;

  const close = el('button', { type: 'button', class: 'ficha__close', 'aria-label': 'Cerrar ficha' }, '✕');
  close.addEventListener('click', () => dlg.close());

  const fig = el('figure', { class: 'ficha__media' });
  if (data?.image) {
    const img = el('img', {
      src: bigImg(data.image), alt: `${c.es} (${c.latin}), fotografía de Wikipedia`,
      width: '500', height: '340', decoding: 'async', referrerpolicy: 'no-referrer'
    });
    img.addEventListener('error', () => { if (img.src !== data.image) img.src = data.image; }, { once: true });
    fig.append(img, el('figcaption', {}, 'Foto: Wikimedia Commons, vía Wikipedia'));
  } else {
    fig.append(el('p', { class: 'ficha__nophoto' }, 'La foto no está disponible sin conexión.'));
  }

  const dl = el('dl', { class: 'ficha__facts' });
  [['Profundidad', c.depth], ...c.facts].forEach(([k, v]) => {
    dl.append(el('dt', {}, k), el('dd', {}, v));
  });

  const body = el('div', { class: 'ficha__body' },
    el('p', { class: 'eyebrow' }, 'Ficha de criatura'),
    el('h2', { id: 'ficha-titulo' }, c.es),
    el('p', { class: 'ficha__latin' }, c.latin),
    el('p', { class: 'ficha__text' }, data?.full || c.fallback),
    dl,
    data?.url
      ? el('p', { class: 'ficha__src' }, el('a', { href: data.url, target: '_blank', rel: 'noopener noreferrer' }, 'Leer más en Wikipedia ↗'))
      : el('p', { class: 'ficha__src' }, 'Texto local. Sin conexión con Wikipedia.')
  );

  dlg.replaceChildren(el('div', { class: 'ficha__inner' }, close, fig, body));
}

/* ---------- Tarjetas ---------- */
function buildCard(c, i, reduce) {
  const media = el('div', { class: 'card__media' });
  media.style.setProperty('--h', String(190 + i * 28));
  const text = el('p', { class: 'card__text' }, 'Cargando datos…');
  const src = el('p', { class: 'card__src' }, '\u00a0');
  const btn = el('button', { type: 'button', class: 'card__btn', 'aria-label': `Ver ficha de ${c.es}` }, 'Ver ficha →');
  const card = el('article', { class: 'card' },
    media,
    el('div', { class: 'card__body' },
      el('p', { class: 'card__depth' }, c.depth),
      el('h3', { class: 'card__title' }, c.es),
      el('p', { class: 'card__latin' }, c.latin),
      text, src, btn
    )
  );

  if (!reduce) {
    card.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      card.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
      card.style.setProperty('--my', (y * 100).toFixed(1) + '%');
      card.style.setProperty('--ry', ((x - 0.5) * 12).toFixed(2) + 'deg');
      card.style.setProperty('--rx', (-(y - 0.5) * 12).toFixed(2) + 'deg');
    });
    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
    });
  }

  return { c, media, text, src, btn, data: null, done: false, li: el('li', { class: 'cell', 'data-card': '' }, card) };
}

function apply(ref, data) {
  const { c, media, text, src } = ref;
  ref.data = data;
  ref.done = !!data;
  if (!data) {
    text.textContent = c.fallback;
    src.textContent = 'Datos locales';
    return;
  }
  text.textContent = data.extract;
  if (data.image && !media.querySelector('img')) {
    const img = el('img', {
      src: data.image, alt: `${c.es} (${c.latin}), fotografía de Wikipedia`,
      width: '320', height: '220', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer'
    });
    img.addEventListener('load', () => img.classList.add('in'));
    media.append(img);
  }
  src.textContent = 'Foto y texto: Wikipedia';
}

export function initCreatures(reduce) {
  const list = document.getElementById('criaturas-lista');
  const dlg = document.getElementById('ficha');
  const root = document.documentElement;
  const refs = LIST.map((c, i) => buildCard(c, i, reduce));
  refs.forEach((r) => list.append(r.li));

  const load = (ref) => fetchSummary(ref.c).then((d) => apply(ref, d));
  const loadAll = () => refs.forEach(load);

  /* Ficha: si los datos aún no llegaron (o fallaron), se reintenta al abrir */
  const canDialog = dlg && typeof dlg.showModal === 'function';
  if (canDialog) {
    dlg.addEventListener('close', () => root.classList.remove('modal-open'));
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    refs.forEach((ref) => ref.btn.addEventListener('click', async () => {
      if (!ref.done) await load(ref);
      renderFicha(dlg, ref);
      root.classList.add('modal-open');
      dlg.showModal();
    }));
  } else {
    refs.forEach((ref) => ref.btn.remove());
  }

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); loadAll(); }
    }, { rootMargin: '600px 0px' });
    io.observe(list);
  } else {
    loadAll();
  }
}
