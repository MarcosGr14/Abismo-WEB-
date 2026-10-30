import articles from './data/articles.json';
import { el } from './dom.js';

const BASE_TITLE = document.title;

export function initBlog() {
  const list = document.getElementById('bitacora-lista');
  const wrap = document.getElementById('bitacora-lista-wrap');
  const view = document.getElementById('articulo');
  const section = document.getElementById('bitacora');
  const relayout = () => dispatchEvent(new Event('abismo:layout'));

  articles.forEach((a) => {
    list.append(
      el('li', { class: 'post', 'data-card': '' },
        el('a', { class: 'post__link', href: `#/${a.slug}` },
          el('p', { class: 'post__meta' }, `${a.kicker} · ${a.read} min`),
          el('h3', { class: 'post__title' }, a.title),
          el('p', { class: 'post__ex' }, a.excerpt),
          el('span', { class: 'post__more', 'aria-hidden': 'true' }, 'Leer →')
        )
      )
    );
  });

  function show(a) {
    const h = el('h2', { id: 'articulo-titulo', tabindex: '-1' }, a.title);
    view.replaceChildren(
      el('a', { class: 'back', href: '#bitacora' }, '← Volver a la bitácora'),
      el('p', { class: 'post__meta' }, `${a.kicker} · ${a.read} min de lectura`),
      h,
      ...a.body.map((p) => el('p', {}, p)),
      el('p', { class: 'post__src' }, `Fuentes: ${a.sources}`)
    );
    view.hidden = false;
    wrap.hidden = true;
    document.title = `${a.title} — ABISMO`;
    section.scrollIntoView();
    h.focus({ preventScroll: true });
    relayout();
  }

  function hide() {
    if (view.hidden) return;
    view.hidden = true;
    view.replaceChildren();
    wrap.hidden = false;
    document.title = BASE_TITLE;
    section.scrollIntoView();
    relayout();
  }

  function route() {
    const m = location.hash.match(/^#\/([a-z0-9-]+)$/);
    const a = m && articles.find((x) => x.slug === m[1]);
    if (a) show(a); else hide();
  }

  addEventListener('hashchange', route);
  route();
}
