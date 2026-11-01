// Tiny i18n layer. English text is the key; a missing entry falls back to English.
// h() in ui.js passes every literal text node and a few attributes through t(), so most
// strings are translated without touching the views. Dynamic strings use t('… {n} …', {n}).
import { vi } from './lang/vi.js';

const DICTS = { vi };
export const LANGS = [['auto', 'Auto'], ['en', 'English'], ['vi', 'Tiếng Việt']];

let lang = 'en';

export function resolveLang(pref) {
  if (pref === 'en' || pref === 'vi') return pref;
  const nav = (typeof navigator !== 'undefined' && navigator.language) || 'en';
  return nav.toLowerCase().startsWith('vi') ? 'vi' : 'en';
}

export function setLang(pref) {
  lang = resolveLang(pref);
  document.documentElement.lang = lang;
}

export const getLang = () => lang;
export const locale = () => (lang === 'vi' ? 'vi-VN' : undefined);

export function t(key, params) {
  const d = DICTS[lang];
  let s = d?.[key];
  if (s === undefined) {
    // Log lines often start/end with newlines: translate the trimmed core and keep the padding.
    const m = key.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const core = m && d?.[m[2]];
    s = core !== undefined && m[2] ? m[1] + core + m[3] : key;
  }
  if (params) s = s.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? ''));
  return s;
}
