// Canale GitHub per le installazioni da cartella.
const UPDATE_REPOSITORY = "k4pPa3/plugin-screenshot-chrome";
const UPDATE_ORIGIN = "https://api.github.com/*";
const UPDATE_ASSET_ORIGINS = ["https://github.com/*", "https://release-assets.githubusercontent.com/*"];
const UPDATE_MAX_BYTES = 16 * 1024 * 1024;
const UPDATE_ENDPOINT = `https://api.github.com/repos/${UPDATE_REPOSITORY}/releases/latest`;

async function findGitHubUpdate(installedVersion) {
  const response = await fetch(UPDATE_ENDPOINT, {
    headers: { Accept: "application/vnd.github+json" },
    credentials: "omit",
    referrerPolicy: "no-referrer",
    redirect: "error",
    cache: "no-cache",
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);

  const release = JSON.parse(new TextDecoder().decode(await readLimited(response, 1024 * 1024)));
  const tag = release?.tag_name;
  const match = typeof tag === "string" && /^v((?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){2,3})$/.exec(tag);
  if (!match || release.draft !== false || release.prerelease !== false) {
    throw new Error("Invalid release");
  }
  const version = match[1];
  const installed = installedVersion.split(".").map(Number);
  const latest = version.split(".").map(Number);
  for (let index = 0; index < 4; index++) {
    const difference = (latest[index] ?? 0) - (installed[index] ?? 0);
    if (difference < 0) return null;
    if (difference > 0) {
      const filename = `forensic-web-capture-${version}.zip`;
      const releaseUrl = `https://github.com/${UPDATE_REPOSITORY}/releases/tag/${tag}`;
      const url = `https://github.com/${UPDATE_REPOSITORY}/releases/download/${tag}/${filename}`;
      const asset = Array.isArray(release.assets) && release.assets.find((item) =>
        item?.name === filename && item.state === "uploaded" && item.browser_download_url === url);
      const digest = typeof asset?.digest === "string" && /^sha256:([0-9a-f]{64})$/i.exec(asset.digest);
      const verifiedAsset = digest && Number.isSafeInteger(asset.size) && asset.size > 0 && asset.size <= UPDATE_MAX_BYTES;
      return {
        version, filename, releaseUrl,
        downloadUrl: verifiedAsset ? url : null,
        digest: verifiedAsset ? digest[1].toLowerCase() : null,
        size: verifiedAsset ? asset.size : null
      };
    }
  }
  return null;
}

async function fetchVerifiedUpdate(update) {
  const response = await fetch(update.downloadUrl, {
    credentials: "omit",
    referrerPolicy: "no-referrer",
    cache: "no-store",
    signal: AbortSignal.timeout(30000)
  });
  const allowed = response.url === update.downloadUrl
    || new URL(response.url).origin === "https://release-assets.githubusercontent.com";
  if (!response.ok || !allowed) throw i18nError("updates.downloadError");

  const bytes = await readLimited(response, update.size);
  if (bytes.length !== update.size || await sha256Hex(bytes) !== update.digest) {
    throw i18nError("updates.integrityError");
  }
  return bytes;
}
