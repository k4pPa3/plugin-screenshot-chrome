const test = require('node:test');
const assert = require('node:assert/strict');
const { context } = require('./helpers.cjs');

// JPEG minimo: basta il marker SOF0 con le dimensioni per buildPdf.
function fakeJpeg(w, h) {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 3,
    1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
}
const latin = (bytes) => Buffer.from(bytes).toString('latin1');

test('print geometry covers the whole screenshot with overlapping A4 strips', async () => {
  const c = await context();
  for (const [w, h] of [[1915, 5737], [390, 12000], [1366, 600], [1920, 50000]]) {
    const shotW = w * 0.75, totalH = h * 0.75;
    const g = c.printGeometry(shotW, totalH);
    assert.ok(shotW * g.k <= g.boxW + 1e-6, 'fits width');
    assert.equal(g.slices[0].top, 0);
    const last = g.slices.at(-1);
    assert.ok(Math.abs(last.top + last.height - totalH) < 1e-6, `reaches bottom ${w}x${h}`);
    for (let i = 1; i < g.slices.length; i++) {
      const prev = g.slices[i - 1];
      assert.ok(g.slices[i].top < prev.top + prev.height, 'strips overlap');
      assert.ok(prev.height * g.k <= g.boxH + 1e-6, 'strip fits page');
    }
  }
});

test('printable PDF is all A4 pages with header, page numbers and the digital PDF hash', async () => {
  const c = await context();
  const hash = 'ab'.repeat(32);
  const { bytes, shotPages } = c.buildPdf({
    jpeg: fakeJpeg(1915, 5737), cssWidth: 1915, cssHeight: 5737,
    info: { title: 'T', url: 'https://x.test/', creator: 'Forensic Web Capture', date: new Date() },
    cover: null,
    print: { header: 'Pagina di prova', pageLabel: (n, t) => `Page ${n} / ${t}`, footer: ['https://x.test/', `copy of x.pdf - SHA-256 ${hash}`] }
  });
  const pdf = latin(bytes);
  assert.ok(shotPages >= 2);
  const boxes = pdf.match(/\/MediaBox \[[^\]]+\]/g);
  assert.equal(boxes.length, shotPages);
  for (const b of boxes) assert.equal(b, '/MediaBox [0 0 595.28 841.89]');
  assert.ok(pdf.includes(`(Page ${shotPages} / ${shotPages})`));
  assert.ok(pdf.includes(hash));
  assert.equal((pdf.match(/\/Subtype \/Image/g) || []).length, 1, 'image embedded once');
});

test('digital PDF keeps a single tall page per 200 inches', async () => {
  const c = await context();
  const { shotPages } = c.buildPdf({
    jpeg: fakeJpeg(1915, 5737), cssWidth: 1915, cssHeight: 5737,
    info: { title: 'T', url: 'u', creator: 'c', date: new Date() }, cover: null
  });
  assert.equal(shotPages, 1);
});

test('landscape printable copy uses A4 landscape pages and larger scale', async () => {
  const c = await context();
  const portrait = c.printGeometry(1915 * 0.75, 5737 * 0.75, false);
  const landscape = c.printGeometry(1915 * 0.75, 5737 * 0.75, true);
  assert.ok(landscape.k > portrait.k * 1.3);
  const { bytes } = c.buildPdf({
    jpeg: fakeJpeg(1915, 5737), cssWidth: 1915, cssHeight: 5737,
    info: { title: 'T', url: 'u', creator: 'c', date: new Date() }, cover: null,
    print: { landscape: true, header: 'h', pageLabel: (n, t) => `${n}/${t}`, footer: ['f'] }
  });
  for (const b of latin(bytes).match(/\/MediaBox \[[^\]]+\]/g)) assert.equal(b, '/MediaBox [0 0 841.89 595.28]');
});
