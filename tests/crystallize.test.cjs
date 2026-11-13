// Contesto di rete esterno, cookie e storage, bozza PEC, report HTML.
const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { context } = require('./helpers.cjs');
const text = (bytes) => new TextDecoder().decode(bytes);
const sha256 = async (s) => Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(s))).toString('hex');

// Finti servizi pubblici: URL -> [status, json]. Registra ogni richiesta.
function fakeFetch(routes, calls) {
  return async (url, opts) => {
    calls.push(url);
    assert.equal(opts.credentials, 'omit');
    const hit = Object.entries(routes).find(([prefix]) => url.startsWith(prefix));
    const [status, json] = hit ? hit[1] : [404, { errorCode: 404 }];
    return new Response(JSON.stringify(json), { status });
  };
}

const ROUTES = {
  'https://data.iana.org/rdap/dns.json': [200, { services: [[['com'], ['http://insecure.example/', 'https://rdap.test/com/']], [['uk'], ['https://rdap.test/uk/']]] }],
  'https://data.iana.org/rdap/ipv4.json': [200, { services: [[['93.184.0.0/16'], ['https://rdap.ripe.test/']]] }],
  'https://rdap.test/com/domain/www.example.com': [404, {}],
  'https://rdap.test/com/domain/example.com': [200, {
    ldhName: 'EXAMPLE.COM', status: ['active'], events: [{ eventAction: 'registration', eventDate: '1995-08-14T04:00:00Z' }],
    nameservers: [{ ldhName: 'A.NS.TEST' }], secureDNS: { delegationSigned: true },
    entities: [{ roles: ['registrar'], vcardArray: ['vcard', [['fn', {}, 'text', 'Registrar <b>X</b>']]], publicIds: [{ type: 'IANA Registrar ID', identifier: '9' }] }]
  }],
  'https://rdap.test/uk/domain/bbc.co.uk': [200, { ldhName: 'bbc.co.uk' }],
  'https://rdap.ripe.test/ip/93.184.215.14': [200, { handle: 'NET-1', name: 'EDGE', startAddress: '93.184.0.0', endAddress: '93.184.255.255',
    country: 'NL', entities: [{ roles: ['registrant'], vcardArray: ['vcard', [['fn', {}, 'text', 'Edge Org']]] }] }],
  'https://cloudflare-dns.com/dns-query?name=www.example.com&type=A': [200, { Status: 0, AD: true,
    Answer: [{ name: 'www.example.com.', type: 5, TTL: 60, data: 'edge.example.net.' }, { name: 'edge.example.net.', type: 1, TTL: 60, data: '93.184.215.14' }] }],
  'https://cloudflare-dns.com/dns-query?name=example.com&type=NS': [200, { Status: 0, Answer: [{ name: 'example.com.', type: 2, TTL: 60, data: 'a.ns.test.' }] }]
};

test('network context: RDAP domain and IP via IANA bootstrap, https only, DNS over HTTPS', async () => {
  const c = await context();
  const calls = [];
  c.fetch = fakeFetch(ROUTES, calls);
  const nc = await c.collectNetContext('https://www.example.com/page?x=1', { browserIp: '93.184.215.14' });
  assert.equal(nc.rdapDomain.query, 'example.com');
  assert.equal(nc.rdapDomain.summary.registrar, 'Registrar <b>X</b>');
  assert.equal(nc.rdapDomain.summary.registrarIanaId, '9');
  assert.equal(nc.rdapDomain.summary.dnssec, true);
  assert.equal(nc.rdapIp.source, 'browser');
  assert.equal(nc.rdapIp.summary.organization, 'Edge Org');
  assert.equal(nc.browserIpInDns, true);
  const a = nc.dns.find((q) => q.type === 'A');
  assert.equal(a.dnssecValidated, true);
  assert.equal(a.answers.map((x) => x.type).join(','), 'CNAME,A');
  // Zone records on the registrable domain found by RDAP, not on the host.
  assert.equal(nc.dns.find((q) => q.type === 'NS').name, 'example.com');
  assert.ok(!calls.some((u) => u.startsWith('http:')), 'never plain http');
  assert.ok(!calls.some((u) => u.includes('page') || u.includes('x=1')), 'path and query never sent');
});

test('network context: second-level suffixes and registries without RDAP', async () => {
  const c = await context();
  c.fetch = fakeFetch(ROUTES, []);
  const uk = await c.rdapDomain('www.bbc.co.uk');
  assert.equal(uk.query, 'bbc.co.uk');
  const it = await c.rdapDomain('www.example.it');
  assert.equal(it.unavailable, 'no-rdap');
  assert.equal(it.whoisInfo, 'https://www.iana.org/domains/root/db/it.html');
});

test('network context: CIDR matching for IPv4 and IPv6', async () => {
  const c = await context();
  assert.equal(c.ipInCidr('93.184.215.14', '93.184.0.0/16'), true);
  assert.equal(c.ipInCidr('93.185.0.1', '93.184.0.0/16'), false);
  assert.equal(c.ipInCidr('2a04:4e42::81', '2a04:4e40::/29'), true);
  assert.equal(c.ipInCidr('2a05::1', '2a04:4e40::/29'), false);
  assert.equal(c.ipInCidr('::ffff:1.2.3.4', '::ffff:0:0/96'), true);
  assert.equal(c.ipInCidr('1.2.3.4', '2a04::/16'), false);
});

test('defaults contact no external service at all', async () => {
  const c = await context();
  const calls = [];
  c.fetch = async (url) => { calls.push(url); throw new Error('unexpected fetch'); };
  c.readPackageFile = async () => new Uint8Array();
  c.eval(`
    capture = async () => ({date:new Date('2026-11-06T08:00:00Z'),url:'https://example.test/',title:'t',
      width:800,height:600,image:new Uint8Array([1,2,3]),network:null,networkError:null});
    getSettings = async () => ({...DEFAULT_SETTINGS, format:'png'});
    download = async () => {};
  `);
  await c.run({ title: 't', url: 'https://example.test/' });
  assert.deepEqual(calls, []);
});

async function runWith(features, shotExtra = {}, advanced = {}) {
  const c = await context();
  c.testFeatures = features; c.testShot = shotExtra; c.testAdvanced = advanced;
  c.eval(`
    getSettings = async () => ({...DEFAULT_SETTINGS, format:'png', features: {...DEFAULT_SETTINGS.features, jsonReport:true, ...testFeatures},
      advanced: {...DEFAULT_SETTINGS.advanced, ...testAdvanced},
      custody: {...DEFAULT_SETTINGS.custody, caseRef: 'RG 1/2026'}});
    capture = async () => ({date:new Date('2026-11-06T08:00:00Z'),url:'https://example.test/a',title:'<script>alert(1)</script>',
      width:800,height:600,image:new Uint8Array([1,2,3]),network:null,networkError:null,...testShot});
    globalThis.files = [];
    makeZip = files => { globalThis.files = files; return new Uint8Array(); };
    download = async () => {};
  `);
  const result = await c.run({ title: 't', url: 'https://example.test/a' });
  return { c, files: c.files, result };
}
const find = (files, suffix) => files.find((f) => f.name.endsWith(suffix));

const BROWSER_STATE = {
  at: '2026-11-06T08:00:01Z',
  cookies: [
    { name: 'sid', value: 'top-secret-session', domain: 'example.test', path: '/', expires: -1, session: true, httpOnly: true, secure: true, size: 21 },
    { name: '_t', value: 'track', domain: '.ads.test', path: '/', expires: 1900000000, httpOnly: false, secure: true, size: 7 }
  ],
  storage: { origin: 'https://example.test', local: { entries: [['jwt', 'top-secret-token']], total: 1 }, session: { error: 'SecurityError' } }
};

test('cookies and storage: values only as SHA-256, file in the manifest, nothing secret anywhere', async () => {
  const { files } = await runWith({ storage: true }, { browserState: structuredClone(BROWSER_STATE) });
  const file = find(files, '.storage.json');
  const state = JSON.parse(text(file.bytes));
  assert.equal(state.valuesIncluded, false);
  const sid = state.cookies.find((x) => x.name === 'sid');
  assert.equal(sid.valueSha256, await sha256('top-secret-session'));
  assert.equal(sid.value, undefined);
  assert.equal(sid.thirdParty, false);
  assert.equal(state.cookies.find((x) => x.name === '_t').thirdParty, true);
  assert.equal(state.localStorage.entries[0].valueSha256, await sha256('top-secret-token'));
  assert.equal(state.sessionStorage.error, 'SecurityError');
  assert.ok(text(find(files, '.manifest.sha256').bytes).includes(file.name));
  for (const f of files) assert.ok(!text(f.bytes).includes('top-secret'), `${f.name} leaks a value`);
});

test('cookies and storage in clear text only on explicit request, with a warning', async () => {
  const { c, files, result } = await runWith({ storage: true }, { browserState: structuredClone(BROWSER_STATE) }, { storageValues: true });
  const state = JSON.parse(text(find(files, '.storage.json').bytes));
  assert.equal(state.cookies.find((x) => x.name === 'sid').value, 'top-secret-session');
  assert.ok(result.warnings.some((w) => c.tm(w) === c.t('warn.storageValues')));
});

test('a storage failure is a warning, not a failed acquisition', async () => {
  const { c, files, result } = await runWith({ storage: true }, { storageError: 'boom' });
  assert.ok(!find(files, '.storage.json'));
  assert.ok(result.warnings.some((w) => c.tm(w).includes('boom')));
});

test('network context result is evidence in the manifest and summarised in the reports', async () => {
  const c = await context();
  const calls = [];
  c.fetch = fakeFetch({ ...ROUTES,
    'https://rdap.test/com/domain/www.example.com': [404, {}] }, calls);
  c.eval(`
    getSettings = async () => ({...DEFAULT_SETTINGS, format:'png', features: {...DEFAULT_SETTINGS.features, jsonReport:true, netContext:true}});
    capture = async () => ({date:new Date('2026-11-06T08:00:00Z'),url:'https://www.example.com/',title:'t',width:800,height:600,
      image:new Uint8Array([1]),network:{redirects:[],document:{url:'https://www.example.com/',status:200,headers:{},remoteIPAddress:'93.184.215.14'}},networkError:null});
    makeZip = files => { globalThis.files = files; return new Uint8Array(); };
    download = async () => {};
  `);
  await c.run({ title: 't', url: 'https://www.example.com/' });
  const nc = find(c.files, '.netcontext.json');
  assert.equal(JSON.parse(text(nc.bytes)).rdapIp.summary.name, 'EDGE');
  assert.ok(text(find(c.files, '.manifest.sha256').bytes).includes(nc.name));
  const report = text(find(c.files, '.report.txt').bytes);
  assert.ok(report.includes('Edge Org') && report.includes('EXAMPLE.COM'));
  assert.equal(JSON.parse(text(find(c.files, '.report.json').bytes)).netContext.browserIpInDns, true);
});

test('HTML report: inert, escaped, in the manifest', async () => {
  const { files } = await runWith({});
  const file = find(files, '.report.html');
  assert.ok(file, 'HTML report on by default');
  const html = text(file.bytes);
  assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'/);
  assert.ok(!/<script/i.test(html), 'no script element, even from the page title');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!/(src|href)="https?:/i.test(html), 'no external resources');
  assert.ok(text(find(files, '.manifest.sha256').bytes).includes(file.name));
});

test('escapeHtml covers all special characters', async () => {
  const c = await context();
  assert.equal(c.escapeHtml(`<a href="x" onclick='y'>&</a>`), '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
});

test('PEC draft: valid MIME, manifest attached unchanged, hash in the body, bundled outside the evidence manifest', async () => {
  const { files, result, c } = await runWith({ pec: true, zip: true }, {}, { pecRecipient: 'me@pec.example.it' });
  const eml = find(files, '.pec.eml');
  assert.ok(eml);
  const raw = text(eml.bytes);
  assert.match(raw, /^X-Unsent: 1\r\nTo: me@pec\.example\.it\r\n/);
  const boundary = raw.match(/boundary="([^"]+)"/)[1];
  const parts = raw.split(`--${boundary}`).slice(1, -1);
  assert.equal(parts.length, 3);
  const decode = (part) => Buffer.from(part.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64');
  const manifestPart = parts.find((p) => /filename="[^"]+\.manifest\.sha256"/.test(p));
  const manifest = decode(manifestPart);
  const manifestHash = Buffer.from(await webcrypto.subtle.digest('SHA-256', manifest)).toString('hex');
  assert.ok(decode(parts[0]).toString('utf8').includes(manifestHash));
  assert.ok(result.notes.some((n) => c.tm(n).includes(eml.name)));
  assert.ok(result.zipHash);
  assert.doesNotMatch(manifest.toString('utf8'), /\.pec\.eml/);
  assert.ok(text(files.find(f => f.name === 'SHA256SUMS.txt').bytes).includes(eml.name));
});

test('PEC draft: an invalid recipient cannot inject headers', async () => {
  const c = await context();
  for (const bad of ['a@b.it\r\nBcc: x@y.it', 'Name <a@b.it>', 'a@b.it, c@d.it', 'no-at-sign']) {
    assert.equal(c.isValidEmailAddress(bad), false, bad);
    const raw = text(c.buildEml({ to: bad, subject: 's', body: 'b' }));
    assert.ok(!/^To:/m.test(raw) && !/^Bcc:/m.test(raw), bad);
  }
  assert.equal(c.isValidEmailAddress('mario.rossi@pec.example.it'), true);
});

test('PEC draft: non-ASCII subject is RFC 2047 encoded and line breaks are removed', async () => {
  const c = await context();
  const raw = text(c.buildEml({ subject: 'Acquisizione è\r\nBcc: x@y', body: 'b' }));
  const subject = raw.match(/^Subject: (.*)$/m)[1];
  assert.match(subject, /^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
  assert.equal(Buffer.from(subject.slice(10, -2), 'base64').toString(), 'Acquisizione è Bcc: x@y');
  assert.ok(!/^Bcc:/m.test(raw));
});
