import { computed, signal, type ReadonlySignal, type Signal } from './signal.js';
export type Locale = 'en' | 'ar';
const STORAGE_KEY = 'sovereign.locale';
function detectInitial(): Locale {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'ar') return stored;
  } catch { /* storage unavailable */ }
  try {
    const lang = globalThis.navigator?.language ?? 'en';
    return lang.toLowerCase().startsWith('ar') ? 'ar' : 'en';
  } catch { return 'en'; }
}
const localeSignal: Signal<Locale> = signal(detectInitial());
export const locale = localeSignal;
export const dir: ReadonlySignal<'ltr' | 'rtl'> = computed(() => (locale.get() === 'ar' ? 'rtl' : 'ltr'));
const DICT: Record<Locale, Record<string, string>> = {
  en: {
    brand: 'SOVEREIGN·EDGE', hero_a: 'State off-thread.', hero_b: 'Compute in WASM.', hero_c: 'Paint only.',
    projects_title: 'Projects', projects_hint: 'optimistic · CRDT · offline-first',
    add_placeholder: 'New project title… (try it — 15% of commits fail on purpose)', add_button: 'Add',
    delete_aria: 'delete', status_live: 'live', status_draft: 'draft', bench_title: 'WASM Morph Bench',
    locale_switch: 'عربي', locale_switch_aria: 'switch language', loading: 'loading…',
  },
  ar: {
    brand: 'SOVEREIGN·EDGE', hero_a: 'الحالة خارج الخيط الرئيسي.', hero_b: 'الحساب في WASM.', hero_c: 'الرسم فقط.',
    projects_title: 'المشاريع', projects_hint: 'تفاؤلي · CRDT · يعمل بلا اتصال',
    add_placeholder: 'عنوان مشروع جديد… (جرّب — 15% من الالتزامات تفشل عمدًا)', add_button: 'إضافة',
    delete_aria: 'حذف', status_live: 'منشور', status_draft: 'مسودة', bench_title: 'منصة تحويل WASM',
    locale_switch: 'EN', locale_switch_aria: 'تبديل اللغة', loading: 'جارٍ التحميل…',
  },
};
export function t(key: string): string { return DICT[locale.get()][key] ?? DICT.en[key] ?? key; }
export function tIn(loc: Locale, key: string): string { return DICT[loc][key] ?? DICT.en[key] ?? key; }
export function setLocale(next: Locale): void {
  locale.set(next);
  try { globalThis.localStorage?.setItem(STORAGE_KEY, next); } catch { /* non-fatal */ }
}
export function applyDirection(): void {
  try {
    const doc = globalThis.document;
    if (doc !== undefined) { doc.documentElement.setAttribute('dir', dir.get()); doc.documentElement.lang = locale.get(); }
  } catch { /* non-DOM */ }
}
export function localized(field: string, fieldAr: string): string {
  return locale.get() === 'ar' && fieldAr !== '' ? fieldAr : field;
}
