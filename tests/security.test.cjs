const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { context } = require('./helpers.cjs');

test('HTML export contains only a trusted wrapper and inert, recoverable source', async () => {
  const c = await context();
  const samples = [
    '<html><!-- <head> --><head><script>globalThis.marker=1</script></head></html>',
    '<html data-note="<head>"><head></head><body onload="marker=1"></body></html>',
    '</pre><script>alert(1)</script><meta http-equiv="refresh" content="0;url=https://example.invalid">',
    '<iframe srcdoc="<script>alert(1)</script>"></iframe><img src="https://example.invalid/x" onerror="x()">',
    '&lt;/pre&gt; & &#60;script&#62; <!-- unterminated <head>'
  ];
  for (const source of samples) {
    const html = c.protectHtml(source);
    // Independent parser: verifies actual elements, not the escaping implementation.
    // Su Windows "python3" è spesso l'alias del Microsoft Store: si usa il launcher "py".
    const python = process.env.PYTHON || (process.platform === 'win32' ? 'py' : 'python3');
    const parsed = spawnSync(python, ['-c', `import sys,json
from html.parser import HTMLParser
class P(HTMLParser):
 def __init__(self):
  super().__init__(); self.tags=[]; self.meta=[]; self.source=''; self.inpre=False
 def handle_starttag(self,t,a):
  self.tags.append(t)
  if t=='meta': self.meta.append(dict(a))
  if t=='pre': self.inpre=True
 def handle_endtag(self,t):
  if t=='pre': self.inpre=False
 def handle_data(self,d):
  if self.inpre: self.source+=d
p=P();p.feed(sys.stdin.read());print(json.dumps({'tags':p.tags,'meta':p.meta,'source':p.source}))`], { input: html, encoding: 'utf8' });
    assert.equal(parsed.status, 0, parsed.stderr);
    const doc = JSON.parse(parsed.stdout);
    assert.deepEqual(doc.tags, ['html', 'head', 'meta', 'meta', 'title', 'body', 'pre']);
    assert.equal(doc.source, source);
    assert.equal(doc.meta[1]['http-equiv'], 'Content-Security-Policy');
    assert.match(doc.meta[1].content, /default-src 'none'/);
  }
});

test('shell literals cannot execute page-title substitutions', async () => {
  const c = await context();
  const title = "$(printf INJECTED)`printf INJECTED` O'Brien";
  const r = spawnSync('sh', ['-c', 'printf %s ' + c.shellLiteral(title)], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, title);
  assert.equal(c.powershellLiteral(title), "'$(printf INJECTED)`printf INJECTED` O''Brien'");
});

test('all locales describe every signature check outcome and provide new messages', async () => {
  const c = await context();
  for (const locale of ['en', 'it', 'fr', 'es']) {
    c.setLanguage(locale);
    for (const key of ['tsa.check.verified', 'tsa.check.untrusted', 'tsa.check.invalid', 'tsa.check.unsupported', 'tsa.pendingReceipt', 'err.download', 'options.tsa.caPem', 'options.tsa.caPem.invalid']) {
      assert.ok(c.eval(`I18N.${locale}[${JSON.stringify(key)}]`));
    }
    assert.notEqual(c.t('popup.tsaTime'), 'Date/time certified by the TSA');
    assert.match(c.t('tsa.check.invalid'), /NOT|NON|NO/);
    assert.match(c.t('tsa.check.verified'), /(Revocation|Revoca|Révocation|Revocación)/);
  }
});
