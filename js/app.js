import { loadData, loadCert, store, settings, applyContentLang } from './store.js';
import { setLang, t as T } from './i18n.js';
import { h, mount } from './ui.js';
import * as V from './views.js';
import { practice, mock, leaveMock } from './quiz.js';

const root = document.getElementById('view');

const NAV = [
  ['', 'Home', 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
  ['practice', 'Practice', 'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9'],
  ['mock', 'Mock', 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z'],
  ['labs', 'Labs', 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3', 'labs'],
  ['domains', 'Domains', 'M4 6h16M4 12h16M4 18h10', '!labs'],   // certifications without labs get Domains in this slot
  ['more', 'More', 'M5 12h.01M12 12h.01M19 12h.01'],
];

// Which screens exist depends on the selected certification (see data/certs.json "features").
const FEATURE_OF = { labs: 'labs', plan: 'plan', case: 'case' };
const hasFeature = (key) => !FEATURE_OF[key] || !!store.cert.features[FEATURE_OF[key]];
const navItems = () => NAV.filter(([, , , cond]) => !cond || (cond[0] === '!' ? !store.cert.features[cond.slice(1)] : store.cert.features[cond]));

const ROUTES = {
  '': (a) => V.dashboard(root, a),
  practice: (a) => practice(root, a),
  mock: () => mock(root),
  labs: (a) => V.labs(root, a),
  certs: () => V.certs(root, { switchCert }),
  plan: () => V.plan(root),
  domains: () => V.domains(root),
  case: () => V.caseStudy(root),
  settings: () => V.settingsView(root, { applyTheme, applyLang, applyFontSize }),
  more: () => more(),
};

function more() {
  const item = (href, title, sub) => h('a', { class: 'card tap', href }, h('b', null, title), h('p', { class: 'small' }, sub));
  const F = store.cert.features;
  mount(root,
    h('h1', null, 'More'),
    item('#/certs', 'Certification', store.cert.name),
    F.plan && item('#/plan', 'Study plan', 'Two-week schedule with checkboxes'),
    item('#/domains', 'Domains', 'What is tested and the traps'),
    F.case && item('#/case', 'Case study', 'MekongFreight architecture decisions'),
    item('#/settings', 'Settings', 'Theme, API key, models, backup'));
}

/** Switch the active certification and go to its dashboard. */
async function switchCert(id) {
  if (id !== store.cert.id) {
    try { await loadCert(id); } catch (e) { alert(e.message); return; }
    applyLang();
  }
  if (location.hash === '#/') route(); else location.hash = '#/';
}

export function applyLang() {
  setLang(settings().lang);
  applyContentLang();
  if (document.getElementById('nav')) renderNav(currentKey());
}

const currentKey = () => { const k = location.hash.replace(/^#\/?/, '').split('/')[0]; return ROUTES[k] ? k : ''; };

export function applyTheme() {
  const t = settings().theme;
  const r = document.documentElement;
  if (t === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', t);
  const dark = t === 'auto' ? matchMedia('(prefers-color-scheme: dark)').matches : t.includes('dark');
  const bg = getComputedStyle(r).getPropertyValue('--bg').trim();
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', bg || (dark ? '#131313' : '#F3F2EF'));
}

export function applyFontSize() {
  const v = settings().fontSize;
  const r = document.documentElement;
  if (!v || v === 'normal') r.removeAttribute('data-fs'); else r.setAttribute('data-fs', v);
}

function renderNav(active) {
  const nav = document.getElementById('nav');
  nav.dataset.brand = store.cert.short + ' Study';
  document.title = store.cert.short + ' Study';
  nav.replaceChildren(...navItems().map(([key, label, d]) => {
    const moreKeys = ['plan', 'domains', 'case', 'settings', 'certs', 'more'].filter((k) => k !== 'domains' || store.cert.features.labs);
    const on = key === active || (key === 'more' && moreKeys.includes(active));
    const svg = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
    return h('a', { href: '#/' + key, class: 'navitem' + (on ? ' on' : ''), 'aria-current': on ? 'page' : null, html: svg + `<span>${T(label)}</span>` });
  }));
}

function route() {
  leaveMock();
  const [key = '', arg] = location.hash.replace(/^#\/?/, '').split('/');
  if (ROUTES[key] && !hasFeature(key)) { location.hash = '#/'; return; }   // e.g. #/labs on a cert without labs
  const fn = ROUTES[key] || ROUTES[''];
  renderNav(ROUTES[key] ? key : '');
  // Layout hook for CSS: lets desktop styles pick a layout per screen (list vs detail views differ).
  root.dataset.view = (ROUTES[key] ? key || 'home' : 'home') + (arg ? '-detail' : '');
  try { fn(arg); } catch (e) { root.replaceChildren(h('div', { class: 'card' }, h('b', null, 'Something went wrong'), h('p', { class: 'small' }, e.message))); console.error(e); }
  window.scrollTo(0, 0);
  root.focus({ preventScroll: true });   // announce the new screen to assistive tech; main has no outline
}

async function boot() {
  try {
    await loadData();
  } catch (e) {
    root.replaceChildren(h('div', { class: 'card' }, h('b', null, 'Cannot load study data'), h('p', { class: 'small' }, e.message + ' — open the app once while online.')));
    return;
  }
  applyLang();
  applyTheme();
  applyFontSize();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
