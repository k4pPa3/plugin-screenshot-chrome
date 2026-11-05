// Registrazione HAR 1.2 di tutte le richieste fatte dalla pagina durante la
// ricarica: per ogni risposta si conserva l'impronta SHA-256 del contenuto
// ricevuto e, entro un limite complessivo, il contenuto stesso.

const HAR_MAX_ENTRIES = 3000;
const HAR_MAX_BODY_TOTAL = 50 * 1024 * 1024;  // contenuti incorporati nell'HAR
const HAR_MAX_BODY_EACH = 10 * 1024 * 1024;

// Header che danno accesso all'account di chi acquisisce: nome sì, valore no.
const HAR_SECRET_HEADERS = new Set(["cookie", "set-cookie", "authorization", "proxy-authorization"]);

function harHeaders(headers, redacted = "[redacted]") {
  const out = [];
  for (const [name, value] of Object.entries(headers || {})) {
    for (const v of String(value).split("\n")) {
      out.push({ name, value: HAR_SECRET_HEADERS.has(name.toLowerCase()) ? redacted : v });
    }
  }
  return out;
}

function harQuery(url) {
  try {
    return [...new URL(url).searchParams].map(([name, value]) => ({ name, value }));
  } catch (_) { return []; }
}

// Raccoglie gli eventi Network.* del CDP in voci HAR, una per richiesta
// (i redirect riusano lo stesso requestId: la voce precedente viene chiusa).
function createHarRecorder() {
  const open = new Map();
  const done = [];
  const finish = (e) => { if (done.length < HAR_MAX_ENTRIES) done.push(e); };

  function onEvent(method, params) {
    if (method === "Network.requestWillBeSent") {
      const prev = open.get(params.requestId);
      if (prev && params.redirectResponse) {
        prev.response = params.redirectResponse;
        prev.finished = true;
        finish(prev);
      }
      open.set(params.requestId, {
        requestId: params.requestId,
        request: params.request,
        type: params.type || "",
        wallTime: params.wallTime,
        startTs: params.timestamp,
        response: null,
        finished: false
      });
    } else if (method === "Network.responseReceived") {
      const e = open.get(params.requestId);
      if (e) { e.response = params.response; e.type = params.type || e.type; }
    } else if (method === "Network.loadingFinished") {
      const e = open.get(params.requestId);
      if (e) {
        e.finished = true;
        e.endTs = params.timestamp;
        e.encodedDataLength = params.encodedDataLength;
        open.delete(params.requestId);
        finish(e);
      }
    } else if (method === "Network.loadingFailed") {
      const e = open.get(params.requestId);
      if (e) {
        e.failed = params.errorText || "failed";
        e.endTs = params.timestamp;
        open.delete(params.requestId);
        finish(e);
      }
    }
  }

  return { onEvent, entries: () => [...done, ...open.values()].slice(0, HAR_MAX_ENTRIES) };
}

// Contenuto restituito da Network.getResponseBody in byte.
function harBodyBytes({ body, base64Encoded }) {
  return base64Encoded ? base64ToBytes(body) : new TextEncoder().encode(body);
}

function buildHar(entries, { creator, version, pageTitle, startedAt, redacted }) {
  const iso = (wall) => (Number.isFinite(wall) ? new Date(wall * 1000).toISOString() : startedAt);
  return {
    log: {
      version: "1.2",
      creator: { name: creator, version },
      pages: [{ startedDateTime: startedAt, id: "page_1", title: pageTitle, pageTimings: {} }],
      entries: entries.map((e) => {
        const r = e.response || {};
        const time = Number.isFinite(e.endTs) && Number.isFinite(e.startTs) ? Math.max(0, (e.endTs - e.startTs) * 1000) : -1;
        const content = { size: e.bodySize ?? -1, mimeType: r.mimeType || "" };
        if (e.bodyText !== undefined) { content.text = e.bodyText; if (e.bodyBase64) content.encoding = "base64"; }
        return {
          pageref: "page_1",
          startedDateTime: iso(e.wallTime),
          time: Math.round(time),
          request: {
            method: e.request?.method || "GET",
            url: redactUrl(e.request?.url || ""),
            httpVersion: r.protocol || "",
            headers: harHeaders(e.request?.headers, redacted),
            queryString: harQuery(e.request?.url),
            cookies: [],
            headersSize: -1,
            bodySize: e.request?.postData ? e.request.postData.length : 0
          },
          response: {
            status: r.status || 0,
            statusText: r.statusText || (e.failed ? e.failed : ""),
            httpVersion: r.protocol || "",
            headers: harHeaders(r.headers, redacted),
            cookies: [],
            content,
            redirectURL: (r.headers && (r.headers.location || r.headers.Location)) || "",
            headersSize: -1,
            bodySize: Number.isFinite(e.encodedDataLength) ? e.encodedDataLength : -1
          },
          cache: {},
          timings: { send: 0, wait: Math.max(0, Math.round(time)), receive: 0 },
          serverIPAddress: r.remoteIPAddress || "",
          _resourceType: e.type,
          _fromCache: !!(r.fromDiskCache || r.fromServiceWorker || r.fromPrefetchCache),
          _sha256: e.sha256 || null,
          ...(e.failed ? { _error: e.failed } : {}),
          ...(e.bodyOmitted ? { _bodyOmitted: e.bodyOmitted } : {})
        };
      })
    }
  };
}
