/** Crea nodos del DOM sin innerHTML. Los hijos string se insertan como texto. */
export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') n.className = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) {
    n.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return n;
}
