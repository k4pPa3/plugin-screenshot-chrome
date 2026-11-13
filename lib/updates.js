// Canale GitHub per le installazioni da cartella.
const UPDATE_REPOSITORY = "k4pPa3/plugin-screenshot-chrome";
const UPDATE_ORIGIN = "https://api.github.com/*";
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

  const release = await response.json();
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
      return { version, filename, releaseUrl, downloadUrl: asset ? url : null };
    }
  }
  return null;
}
