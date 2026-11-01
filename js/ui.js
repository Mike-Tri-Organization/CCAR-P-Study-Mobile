// Tiny DOM helpers shared by the views.
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  add(el, kids);
  return el;
}

function add(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export const mount = (root, ...kids) => { root.replaceChildren(); add(root, kids); };

export const pct = (x) => (x == null ? '–' : Math.round(x * 100) + '%');

export function bullets(items, cls = '') {
  return h('ul', { class: 'bullets ' + cls }, items.map((i) => h('li', null, i)));
}

export function chips(options, selected, onChange) {
  const wrap = h('div', { class: 'chips', role: 'radiogroup' });
  const render = (sel) => {
    wrap.replaceChildren(...options.map(([value, label]) =>
      h('button', {
        class: 'chip' + (value === sel ? ' on' : ''), type: 'button', role: 'radio',
        'aria-checked': value === sel ? 'true' : 'false',
        onClick: () => { render(value); onChange(value); },
      }, label)));
  };
  render(selected);
  return wrap;
}

export function ring(frac, label, sub) {
  const r = 52, c = 2 * Math.PI * r;
  const f = frac == null ? 0 : Math.max(0, Math.min(1, frac));
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.setAttribute('class', 'ring');
  svg.innerHTML =
    `<circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--line)" stroke-width="10"/>` +
    `<circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--accent)" stroke-width="10" stroke-linecap="round" ` +
    `stroke-dasharray="${c * f} ${c}" transform="rotate(-90 60 60)"/>`;
  return h('div', { class: 'ring-wrap' }, svg,
    h('div', { class: 'ring-text' }, h('div', { class: 'ring-num' }, label), sub && h('div', { class: 'small' }, sub)));
}

export function bars(values, labels, target) {
  const wrap = h('div', { class: 'cols' });
  values.forEach((v, i) => {
    wrap.append(h('div', { class: 'col' },
      h('div', { class: 'col-val' }, pct(v)),
      h('div', { class: 'col-bar' }, h('div', { class: 'col-fill ' + (v >= target ? 'good' : ''), style: `height:${Math.max(2, v * 100)}%` })),
      h('div', { class: 'col-lbl' }, labels[i])));
  });
  if (target != null) wrap.style.setProperty('--target', target * 100 + '%');
  return wrap;
}

export function toast(msg) {
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}

export function download(name, text, type = 'application/json') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove();
}
