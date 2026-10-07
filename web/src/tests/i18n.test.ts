import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDirection, dir, locale, localized, setLocale, t, tIn } from '../runtime/i18n.js';
import { effect, flushSignals } from '../runtime/signal.js';
test('i18n: dictionary lookup is exact and EN-fallback is total', () => {
  setLocale('en'); assert.equal(t('projects_title'), 'Projects');
  setLocale('ar'); assert.equal(t('projects_title'), 'المشاريع');
  assert.equal(t('no_such_key_anywhere'), 'no_such_key_anywhere'); setLocale('en');
});
test('i18n: tIn translates for an explicit locale without switching', () => {
  setLocale('en'); assert.equal(tIn('ar', 'add_button'), 'إضافة'); assert.equal(tIn('en', 'add_button'), 'Add');
  assert.equal(locale.peek(), 'en');
});
test('i18n: direction derives from locale (single source of truth)', () => {
  setLocale('ar'); flushSignals(); assert.equal(dir.get(), 'rtl');
  setLocale('en'); flushSignals(); assert.equal(dir.get(), 'ltr');
});
test('i18n: localized() prefers AR only when present', () => {
  setLocale('ar'); assert.equal(localized('EN', 'عربي'), 'عربي');
  assert.equal(localized('EN', ''), 'EN'); setLocale('en'); assert.equal(localized('EN', 'عربي'), 'EN');
});
test('i18n: effects re-run on locale switch (no global storm)', () => {
  setLocale('en'); let seen = ''; let runs = 0;
  effect(() => { seen = t('projects_title'); runs++; });
  flushSignals(); assert.equal(seen, 'Projects'); assert.equal(runs, 1);
  setLocale('ar'); flushSignals(); assert.equal(seen, 'المشاريع'); assert.equal(runs, 2);
  setLocale('ar'); flushSignals(); assert.equal(runs, 2); setLocale('en'); flushSignals();
});
test('i18n: applyDirection is a no-op outside the DOM (does not throw)', () => {
  setLocale('ar'); assert.doesNotThrow(() => applyDirection()); setLocale('en');
});
