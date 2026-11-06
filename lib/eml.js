// Bozza di messaggio per l'invio tramite PEC (facoltativa).
//
// Un'estensione non può spedire email: prepara un file .eml (RFC 5322, MIME)
// con allegati il manifest delle impronte e il report. Aperto in Outlook (che
// grazie a X-Unsent lo apre come bozza da inviare) o in Thunderbird ("Modifica
// come nuovo messaggio") con l'account PEC, si spedisce con un clic. La
// ricevuta di consegna della PEC dà una data certa, opponibile in Italia,
// all'invio di quel manifest: è un'alternativa o un complemento alla marca
// temporale RFC 3161, non verificabile però con strumenti standard.

// Indirizzo semplice, senza nome visualizzato né caratteri che possano
// spezzare l'intestazione (CR, LF, virgole, parentesi angolari).
function isValidEmailAddress(value) {
  const v = String(value || "");
  return v.length <= 254 && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(v);
}

function wrapBase64(bytes) {
  return bytesToBase64(bytes).replace(/.{1,76}/g, "$&\r\n");
}

// Intestazione con caratteri non ASCII: encoded-word RFC 2047 in UTF-8.
function encodeHeaderWord(text) {
  const clean = String(text).replace(/[\r\n]+/g, " ");
  if (/^[\x20-\x7e]*$/.test(clean)) return clean;
  return `=?UTF-8?B?${bytesToBase64(new TextEncoder().encode(clean))}?=`;
}

function rfc5322Date(d) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const p = (n) => String(n).padStart(2, "0");
  return `${days[d.getUTCDay()]}, ${p(d.getUTCDate())} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +0000`;
}

// Solo caratteri sicuri nel nome dell'allegato (i nomi dei reperti lo sono già).
function attachmentName(name) {
  return String(name).replace(/[^A-Za-z0-9._-]/g, "_");
}

function buildEml({ to = "", subject, body, attachments = [], date = new Date() }) {
  const boundary = `fwc-${toHex(crypto.getRandomValues(new Uint8Array(12)))}`;
  const head = [
    "X-Unsent: 1",
    ...(isValidEmailAddress(to) ? [`To: ${to}`] : []),
    `Subject: ${encodeHeaderWord(subject)}`,
    `Date: ${rfc5322Date(date)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "X-Mailer: Forensic Web Capture"
  ];
  const parts = [
    [
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(new TextEncoder().encode(String(body).replace(/\r?\n/g, "\r\n")))
    ].join("\r\n")
  ];
  for (const a of attachments) {
    const name = attachmentName(a.name);
    parts.push([
      `--${boundary}`,
      `Content-Type: ${String(a.mime || "application/octet-stream").split(";")[0]}; name="${name}"`,
      `Content-Disposition: attachment; filename="${name}"`,
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(a.bytes)
    ].join("\r\n"));
  }
  const text = `${head.join("\r\n")}\r\n\r\n${parts.join("\r\n")}\r\n--${boundary}--\r\n`;
  return new TextEncoder().encode(text);
}
