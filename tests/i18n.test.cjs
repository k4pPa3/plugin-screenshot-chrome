const test = require('node:test');
const assert = require('node:assert/strict');
const { context } = require('./helpers.cjs');

test('every locale has exactly the English keys and the same placeholders', async () => {
  const c = await context();
  const en = c.eval('I18N.en');
  const ph = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const locale of ['it', 'fr', 'es']) {
    const other = c.eval(`I18N.${locale}`);
    assert.deepEqual(Object.keys(other).filter((k) => !(k in en)), [], `${locale}: extra keys`);
    assert.deepEqual(Object.keys(en).filter((k) => !(k in other)), [], `${locale}: missing keys`);
    for (const k of Object.keys(en)) assert.equal(ph(other[k]), ph(en[k]), `${locale} ${k}`);
  }
});

test('stored messages are translated in the language active when shown', async () => {
  const c = await context();
  const m = c.msg('warn.clock', { direction: c.msg('clock.behind'), seconds: 12 });
  c.setLanguage('it');
  const it = c.tm(m);
  c.setLanguage('en');
  const en = c.tm(m);
  assert.notEqual(it, en);
  assert.ok(en.includes('12') && en.includes(c.t('clock.behind')));
  assert.equal(c.tm('plain text'), 'plain text');
  assert.equal(c.tm(null), '');
  const err = c.i18nError('err.tsaNotConfigured');
  assert.equal(err.code, 'err.tsaNotConfigured');
});
