// Report di acquisizione in HTML: stesso contenuto del report di testo, in una
// pagina leggibile e stampabile. È un file autonomo e inerte: nessuno script,
// nessuna risorsa esterna (CSP in testa), ogni valore passa da escapeHtml.
// I valori arrivano già preparati dal service worker (model).

const REPORT_HTML_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Valori lunghi senza spazi (hash, URL) vanno a capo ovunque.
function isLongToken(value) {
  return /^\S{40,}$/.test(String(value ?? ""));
}

const REPORT_HTML_STYLE = `
:root{--ink:#16213a;--muted:#5b6478;--line:#e3e7ef;--bg:#f5f7fb;--card:#fff;--accent:#2f6fed;--accent-soft:#e8f0fe;
--ok:#137a43;--ok-soft:#e3f4ea;--warn:#9a5b00;--warn-soft:#fff3dc;--bad:#b3261e;--bad-soft:#fde7e5;
--mono:ui-monospace,"Cascadia Mono",Consolas,"SFMono-Regular",Menlo,monospace}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.hero{background:linear-gradient(135deg,#0f1b33 0%,#1d3a6e 60%,#2f6fed 140%);color:#fff;padding:36px 16px 72px}
.wrap{max-width:1040px;margin:0 auto;padding:0 16px}
.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:12px;opacity:.75;margin:0 0 6px}
h1{font-size:28px;line-height:1.2;margin:0 0 10px;font-weight:650}
.url{font-family:var(--mono);font-size:13px;word-break:break-all;opacity:.92;margin:0 0 18px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}
.chip{display:inline-flex;align-items:center;gap:6px;padding:4px 11px;border-radius:999px;font-size:12.5px;
background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22)}
.chip::before{content:"";width:7px;height:7px;border-radius:50%;background:#9fb4d8}
.chip.ok::before{background:#5fd39a}.chip.warn::before{background:#ffc25c}.chip.bad::before{background:#ff8a80}
main.wrap{margin-top:-48px;padding-bottom:40px}
.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin-bottom:16px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;box-shadow:0 1px 2px rgba(16,24,40,.04)}
.tile .k{font-size:12px;color:var(--muted);margin-bottom:4px}
.tile .v{font-weight:600;overflow-wrap:anywhere}
.alert{border-radius:14px;padding:12px 16px;margin-bottom:16px;border:1px solid}
.alert.warn{background:var(--warn-soft);border-color:#f3d39a;color:#5c3700}
.alert ul{margin:6px 0 0;padding-left:18px}
section.card{background:var(--card);border:1px solid var(--line);border-radius:14px;margin-bottom:16px;overflow:hidden;
box-shadow:0 1px 2px rgba(16,24,40,.04);break-inside:avoid}
section.card>h2{margin:0;padding:12px 18px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);
border-bottom:1px solid var(--line);background:linear-gradient(90deg,var(--accent-soft),transparent 70%)}
dl{display:grid;grid-template-columns:minmax(150px,240px) 1fr;margin:0}
dt,dd{padding:8px 18px;border-bottom:1px solid var(--line);margin:0}
dt{color:var(--muted);font-size:13px}
dd{overflow-wrap:anywhere}
dl>:nth-last-child(-n+2){border-bottom:0}
.mono{font-family:var(--mono);font-size:12.5px;word-break:break-all}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:9px 14px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:12px;color:var(--muted);font-weight:600;background:#fafbfd}
th::first-letter{text-transform:uppercase}
.nowrap{white-space:nowrap}
tr:last-child td{border-bottom:0}
td a{color:var(--accent);text-decoration:none;font-weight:600}
td a:hover{text-decoration:underline}
.timeline{list-style:none;margin:0;padding:10px 18px 14px}
.timeline li{position:relative;padding:5px 0 5px 22px;border-left:2px solid var(--line);margin-left:6px}
.timeline li::before{content:"";position:absolute;left:-6px;top:11px;width:10px;height:10px;border-radius:50%;background:var(--accent);
box-shadow:0 0 0 3px var(--accent-soft)}
.timeline time{font-family:var(--mono);font-size:12px;color:var(--muted);margin-right:8px}
.timeline b{font-weight:600}
pre{margin:0;padding:12px 18px;background:#0f1b33;color:#e6ecff;font:12.5px/1.6 var(--mono);white-space:pre-wrap;word-break:break-all}
.cmd h3{font-size:13px;margin:12px 18px 6px;color:var(--muted);font-weight:600}
.note{color:var(--muted);font-size:13px;padding:12px 18px;margin:0}
footer{color:var(--muted);font-size:12px;text-align:center;padding:8px 16px 32px}
@media (max-width:640px){dl{grid-template-columns:1fr}dt{border-bottom:0;padding-bottom:0}h1{font-size:22px}}
@media print{body{background:#fff}.hero{background:#16213a;-webkit-print-color-adjust:exact;print-color-adjust:exact;padding:20px 0 24px}
main.wrap{margin-top:12px}.tile,section.card{box-shadow:none}pre{background:#f1f3f8;color:#16213a}a{color:inherit}}
`;

function htmlRows(rows) {
  return `<dl>${rows.map(([label, value]) =>
    `<dt>${escapeHtml(label)}</dt><dd${isLongToken(value) ? ' class="mono"' : ""}>${escapeHtml(value)}</dd>`).join("")}</dl>`;
}

function buildReportHtml(m) {
  const chips = (m.chips || []).map((c) => `<li class="chip ${escapeHtml(c.tone || "")}">${escapeHtml(c.label)}</li>`).join("");
  const tiles = (m.summary || []).map(([k, v]) =>
    `<div class="tile"><div class="k">${escapeHtml(k)}</div><div class="v${isLongToken(v) ? " mono" : ""}">${escapeHtml(v)}</div></div>`).join("");
  const warnings = m.warnings?.length
    ? `<div class="alert warn" role="note"><b>${escapeHtml(m.labels.warnings)}</b><ul>${m.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul></div>`
    : "";
  const sections = (m.sections || []).filter(([, rows]) => rows.length)
    .map(([name, rows]) => `<section class="card"><h2>${escapeHtml(name)}</h2>${htmlRows(rows)}</section>`).join("");
  const files = m.files?.length ? `<section class="card"><h2>${escapeHtml(m.labels.files)}</h2><table>
<thead><tr><th>${escapeHtml(m.labels.fileRole)}</th><th>${escapeHtml(m.labels.fileName)}</th><th>${escapeHtml(m.labels.fileSize)}</th><th>SHA-256</th></tr></thead>
<tbody>${m.files.map((f) => `<tr><td>${escapeHtml(f.role)}</td><td><a href="${escapeHtml(encodeURIComponent(f.name))}">${escapeHtml(f.name)}</a></td>
<td class="nowrap">${escapeHtml(f.size)}</td><td class="mono">${escapeHtml(f.sha256)}</td></tr>`).join("")}</tbody></table></section>` : "";
  const headers = m.headers?.length ? `<section class="card"><h2>${escapeHtml(m.labels.headers)}</h2>${htmlRows(m.headers)}</section>` : "";
  const log = m.log?.length ? `<section class="card"><h2>${escapeHtml(m.labels.log)}</h2><ol class="timeline">${m.log.map((e) =>
    `<li><time>${escapeHtml(e.at)}</time><b>${escapeHtml(e.step)}</b> <span class="mono">${escapeHtml(e.detail)}</span></li>`).join("")}</ol>
<p class="note">${escapeHtml(m.labels.logNote)}</p></section>` : "";
  const verify = m.verify?.length ? `<section class="card cmd"><h2>${escapeHtml(m.labels.verify)}</h2>${m.verify.map((v) =>
    `<h3>${escapeHtml(v.label)}</h3><pre>${escapeHtml(v.lines.join("\n"))}</pre>`).join("")}
${(m.verifyNotes || []).map((n) => `<p class="note">${escapeHtml(n)}</p>`).join("")}</section>` : "";

  return `<!doctype html>
<html lang="${escapeHtml(m.lang)}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${REPORT_HTML_CSP}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="generator" content="${escapeHtml(m.generator)}">
<title>${escapeHtml(m.title)} - ${escapeHtml(m.id)}</title>
<style>${REPORT_HTML_STYLE}</style>
</head>
<body>
<header class="hero"><div class="wrap">
<p class="eyebrow">${escapeHtml(m.eyebrow)}</p>
<h1>${escapeHtml(m.pageTitle || m.title)}</h1>
<p class="url">${escapeHtml(m.url)}</p>
<ul class="chips">${chips}</ul>
</div></header>
<main class="wrap">
<div class="summary">${tiles}</div>
${warnings}
${sections}
${files}
${headers}
${log}
${verify}
</main>
<footer>${escapeHtml(m.footer)}</footer>
</body>
</html>
`;
}
