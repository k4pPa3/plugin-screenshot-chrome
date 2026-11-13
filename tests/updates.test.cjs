const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const { ROOT } = require('./helpers.cjs');

const source = readFileSync(join(ROOT, 'lib/updates.js'), 'utf8');
const repo = 'k4pPa3/plugin-screenshot-chrome';
const zip = 'forensic-web-capture-1.10.0.zip';
const url = `https://github.com/${repo}/releases/download/v1.10.0/${zip}`;
const release = {
  tag_name: 'v1.10.0', draft: false, prerelease: false,
  assets: [
    { name: 'store-submission-1.10.0.zip', state: 'uploaded', browser_download_url: url },
    { name: zip, state: 'uploaded', browser_download_url: url }
  ]
};

function check(response, installed = '1.9.0') {
  const find = runInNewContext(`${source}\nfindGitHubUpdate`, {
    AbortSignal,
    fetch: async (endpoint, options) => {
      assert.equal(endpoint, `https://api.github.com/repos/${repo}/releases/latest`);
      assert.equal(options.credentials, 'omit');
      assert.equal(options.referrerPolicy, 'no-referrer');
      assert.equal(options.redirect, 'error');
      return response;
    }
  });
  return find(installed);
}
const reply = data => ({ ok: true, json: async () => data });

test('checks numeric versions and selects the matching extension ZIP', async () => {
  const update = await check(reply(release));
  assert.equal(update.version, '1.10.0');
  assert.equal(update.filename, zip);
  assert.equal(update.downloadUrl, url);
  assert.equal(await check(reply(release), '1.10.0'), null);
  assert.equal(await check(reply(release), '2.0.0'), null);
});

test('a missing, untrusted or incomplete ZIP never enables the download', async () => {
  for (const assets of [[], [{ name: zip, state: 'uploaded', browser_download_url: 'https://example.com/extension.zip' }],
    [{ name: zip, state: 'new', browser_download_url: url }]]) {
    const update = await check(reply({ ...release, assets }));
    assert.equal(update.downloadUrl, null);
    assert.equal(update.releaseUrl, `https://github.com/${repo}/releases/tag/v1.10.0`);
  }
});

test('rejects rate limits, drafts, prereleases and malformed tags', async () => {
  await assert.rejects(check({ ok: false, status: 403 }), /HTTP 403/);
  for (const details of [{ draft: true }, { prerelease: true }, { tag_name: 'v1.10.0-rc1' }]) {
    await assert.rejects(check(reply({ ...release, ...details })), /Invalid release/);
  }
});
