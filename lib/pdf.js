// Generatore PDF: pagina di copertina opzionale + screenshot JPEG.
// Se la pagina è più alta del limite PDF (200 pollici), l'immagine viene
// divisa su più pagine consecutive.

const PDF_MAX_PAGE_PT = 14400;
const PX_TO_PT = 0.75; // 1 px CSS = 0.75 pt (96 dpi)
const A4 = { w: 595.28, h: 841.89 };

function pdfDate(d) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  return `D:${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${sign}${pad(Math.floor(abs / 60))}'${pad(abs % 60)}'`;
}

// Legge larghezza/altezza in pixel dal marker SOF del JPEG.
function jpegSize(bytes) {
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) { i++; continue; }
    const marker = bytes[i + 1];
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return {
        height: (bytes[i + 5] << 8) | bytes[i + 6],
        width: (bytes[i + 7] << 8) | bytes[i + 8]
      };
    }
    i += 2 + len;
  }
  throw new Error("Invalid JPEG");
}

// Stringa PDF in UTF-16BE esadecimale, sicura per qualsiasi carattere.
function pdfText(str) {
  let hex = "FEFF";
  for (const ch of String(str)) {
    const code = ch.codePointAt(0);
    if (code > 0xffff) {
      const c = code - 0x10000;
      hex += (0xd800 + (c >> 10)).toString(16).padStart(4, "0");
      hex += (0xdc00 + (c & 0x3ff)).toString(16).padStart(4, "0");
    } else {
      hex += code.toString(16).padStart(4, "0");
    }
  }
  return `<${hex.toUpperCase()}>`;
}

const WIN_ANSI_EXTRA = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87,
  "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91,
  "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98,
  "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f
};

// Testo per i font standard (WinAnsi): i caratteri non rappresentabili
// diventano "?".
function winAnsiLiteral(str) {
  let out = "(";
  for (const ch of String(str)) {
    const code = ch.codePointAt(0);
    let b;
    if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) b = code;
    else b = WIN_ANSI_EXTRA[ch] ?? 0x3f;
    if (b === 0x28 || b === 0x29 || b === 0x5c) out += "\\" + String.fromCharCode(b);
    else if (b < 0x20) out += " ";
    else out += String.fromCharCode(b);
  }
  return out + ")";
}

function latin1(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

// A capo per un font a larghezza fissa (Courier: 0.6 em per carattere).
function wrapMono(text, maxChars) {
  const lines = [];
  for (let rest of String(text).split(/\r?\n/)) {
    while (rest.length > maxChars) {
      let cut = rest.lastIndexOf(" ", maxChars);
      if (cut < maxChars - 25) cut = maxChars;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut).replace(/^ /, "");
    }
    lines.push(rest);
  }
  return lines;
}

// Impagina le sezioni della copertina e restituisce i content stream.
// Impagina le sezioni della copertina con caratteri e spaziature moltiplicati
// per "s" e restituisce un content stream per pagina.
function layoutCover(cover, s = 1) {
  const f = (x) => Number(x.toFixed(2));
  const M = 50;
  const labelX = M;
  const valueX = M + 140 * s;
  const labelSize = 8.5 * s;
  const valueSize = 8.5 * s;
  const lineH = 11 * s;
  const noteSize = 8 * s;
  const maxChars = Math.floor((A4.w - M - valueX) / (0.6 * valueSize));

  const pages = [];
  let ops = [];
  let y;

  const newPage = (first) => {
    if (ops.length) pages.push(ops.join("\n"));
    ops = [];
    if (first) {
      ops.push(`0.106 0.161 0.275 rg 0 ${A4.h - 110} ${A4.w} 110 re f`);
      ops.push(`BT 1 1 1 rg /F1 20 Tf ${M} ${A4.h - 58} Td ${winAnsiLiteral(cover.title)} Tj ET`);
      ops.push(`BT 0.75 0.82 0.95 rg /F3 10 Tf ${M} ${A4.h - 80} Td ${winAnsiLiteral(cover.subtitle)} Tj ET`);
      y = A4.h - 132;
    } else {
      y = A4.h - M;
    }
  };
  const ensure = (h) => { if (y - h < M) newPage(false); };

  newPage(true);

  for (const section of cover.sections) {
    ensure(40 * s);
    y -= 6 * s;
    ops.push(`BT 0.106 0.161 0.275 rg /F1 ${f(11 * s)} Tf ${M} ${f(y)} Td ${winAnsiLiteral(section.title)} Tj ET`);
    y -= 6 * s;
    ops.push(`0.8 0.82 0.86 RG 0.6 w ${M} ${f(y)} m ${A4.w - M} ${f(y)} l S`);
    y -= 14 * s;
    for (const [label, value] of section.rows) {
      const lines = wrapMono(value ?? "", maxChars);
      ensure(lines.length * lineH);
      ops.push(`BT 0.35 0.38 0.45 rg /F1 ${f(labelSize)} Tf ${labelX} ${f(y)} Td ${winAnsiLiteral(label)} Tj ET`);
      for (const line of lines) {
        ops.push(`BT 0.1 0.1 0.12 rg /F2 ${f(valueSize)} Tf ${f(valueX)} ${f(y)} Td ${winAnsiLiteral(line)} Tj ET`);
        y -= lineH;
      }
      y -= 2 * s;
    }
    y -= 6 * s;
  }

  if (cover.notes?.length) {
    const noteLines = cover.notes.flatMap((n) => wrapMono(n, Math.floor((A4.w - 2 * M) / (0.5 * noteSize))));
    ensure(noteLines.length * lineH + 10 * s);
    for (const line of noteLines) {
      ops.push(`BT 0.35 0.38 0.45 rg /F3 ${f(noteSize)} Tf ${M} ${f(y)} Td ${winAnsiLiteral(line)} Tj ET`);
      y -= lineH;
    }
  }
  pages.push(ops.join("\n"));

  return pages.map((content, i) =>
    `${content}\nBT 0.55 0.57 0.62 rg /F3 7.5 Tf ${M} 30 Td ${winAnsiLiteral(`${cover.footer} - ${cover.pageLabel(i + 1)}`)} Tj ET`
  );
}

// La copertina deve stare in una pagina: se non entra, riduce gradualmente
// caratteri e spaziature. Solo se non basta nemmeno la scala minima (testo
// ancora leggibile) prosegue su più pagine.
const COVER_SCALES = [1, 0.93, 0.86, 0.8, 0.74, 0.68, 0.62];

function fitCover(cover) {
  let pages;
  for (const s of COVER_SCALES) {
    pages = layoutCover(cover, s);
    if (pages.length === 1) break;
  }
  return pages;
}

// Impaginazione per la stampa: lo screenshot viene adattato alla larghezza
// di un A4 verticale e diviso in fasce, con una piccola sovrapposizione così
// nessuna riga di testo cade a cavallo tra due fogli senza essere leggibile.
const PRINT = { margin: 28, header: 20, footer: 30, overlapPt: 15, maxScale: 1 };

function printGeometry(shotW, totalH) {
  const boxW = A4.w - 2 * PRINT.margin;
  const boxH = A4.h - 2 * PRINT.margin - PRINT.header - PRINT.footer;
  const k = Math.min(boxW / shotW, PRINT.maxScale);
  const sliceH = boxH / k; // altezza di una fascia in punti dello screenshot
  const slices = [];
  for (let top = 0; top < totalH; top += sliceH - PRINT.overlapPt) {
    slices.push({ top, height: Math.min(sliceH, totalH - top) });
    if (top + sliceH >= totalH) break;
  }
  return { k, boxW, boxH, slices, x0: PRINT.margin + (boxW - shotW * k) / 2, yTop: A4.h - PRINT.margin - PRINT.header };
}

function buildPdf({ jpeg, cssWidth, cssHeight, info, cover, print }) {
  const { width: imgW, height: imgH } = jpegSize(jpeg);
  const shotW = cssWidth * PX_TO_PT;
  const totalH = cssHeight * PX_TO_PT;

  const geo = print ? printGeometry(shotW, totalH) : null;
  const slices = [];
  if (geo) slices.push(...geo.slices);
  else for (let top = 0; top < totalH; top += PDF_MAX_PAGE_PT) {
    slices.push({ top, height: Math.min(PDF_MAX_PAGE_PT, totalH - top) });
  }

  const objs = [null];
  const alloc = () => objs.push(null) - 1;
  const set = (num, ...parts) => { objs[num] = parts; };
  const n = (x) => Number(x.toFixed(3));

  const catalog = alloc();
  const pagesObj = alloc();
  const infoObj = alloc();
  const image = alloc();
  const pageNums = [];

  set(image,
    `<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    jpeg,
    "\nendstream");

  const fonts = cover || print
    ? [["F1", "Helvetica-Bold"], ["F2", "Courier"], ["F3", "Helvetica"]].map(([key, base]) => {
      const num = alloc();
      set(num, `<< /Type /Font /Subtype /Type1 /BaseFont /${base} /Encoding /WinAnsiEncoding >>`);
      return `/${key} ${num} 0 R`;
    }).join(" ")
    : "";

  if (cover) {
    for (const content of fitCover(cover)) {
      const page = alloc();
      const stream = alloc();
      const bytes = latin1(content);
      set(page, `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /Font << ${fonts} >> >> /Contents ${stream} 0 R >>`);
      set(stream, `<< /Length ${bytes.length} >>\nstream\n`, bytes, "\nendstream");
      pageNums.push(page);
    }
  }

  if (geo) {
    const M = PRINT.margin;
    const clip = (text, max) => (text.length > max ? text.slice(0, max - 1) + "…" : text);
    slices.forEach((s, i) => {
      const page = alloc();
      const stream = alloc();
      const h = s.height * geo.k;
      const ty = geo.yTop + geo.k * s.top - geo.k * totalH;
      const ops = [
        // Fascia dello screenshot, ritagliata al riquadro della pagina.
        `q ${n(geo.x0)} ${n(geo.yTop - h)} ${n(shotW * geo.k)} ${n(h)} re W n`,
        `${n(shotW * geo.k)} 0 0 ${n(totalH * geo.k)} ${n(geo.x0)} ${n(ty)} cm /Im0 Do Q`,
        `0.6 0.62 0.66 RG 0.5 w ${n(geo.x0)} ${n(geo.yTop - h)} ${n(shotW * geo.k)} ${n(h)} re S`,
        `BT 0.1 0.1 0.12 rg /F1 8 Tf ${M} ${n(A4.h - M - 10)} Td ${winAnsiLiteral(clip(print.header, 95))} Tj ET`,
        `BT 0.35 0.38 0.45 rg /F3 8 Tf ${n(A4.w - M - 60)} ${n(A4.h - M - 10)} Td ${winAnsiLiteral(print.pageLabel(i + 1, slices.length))} Tj ET`
      ];
      print.footer.forEach((line, j) => {
        ops.push(`BT 0.35 0.38 0.45 rg /F3 6.5 Tf ${M} ${n(M + 16 - j * 9)} Td ${winAnsiLiteral(clip(line, 150))} Tj ET`);
      });
      const bytes = latin1(ops.join("\n"));
      set(page, `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /Font << ${fonts} >> /XObject << /Im0 ${image} 0 R >> >> /Contents ${stream} 0 R >>`);
      set(stream, `<< /Length ${bytes.length} >>\nstream\n`, bytes, "\nendstream");
      pageNums.push(page);
    });
  } else for (const s of slices) {
    const page = alloc();
    const stream = alloc();
    const ty = s.height + s.top - totalH;
    const content = `q ${n(shotW)} 0 0 ${n(totalH)} 0 ${n(ty)} cm /Im0 Do Q`;
    set(page, `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${n(shotW)} ${n(s.height)}] /Resources << /XObject << /Im0 ${image} 0 R >> >> /Contents ${stream} 0 R >>`);
    set(stream, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    pageNums.push(page);
  }

  set(catalog, `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`);
  set(pagesObj, `<< /Type /Pages /Kids [${pageNums.map((p) => `${p} 0 R`).join(" ")}] /Count ${pageNums.length} >>`);
  set(infoObj, `<< /Title ${pdfText(info.title)} /Subject ${pdfText(info.url)} /Creator ${pdfText(info.creator)} /Producer ${pdfText(info.creator)} /CreationDate (${pdfDate(info.date)}) /ModDate (${pdfDate(info.date)}) >>`);

  const parts = [];
  const offsets = [];
  let length = 0;
  const push = (data) => {
    const bytes = typeof data === "string" ? latin1(data) : data;
    parts.push(bytes);
    length += bytes.length;
  };

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = length;
    push(`${i} 0 obj\n`);
    for (const p of objs[i]) push(p);
    push("\nendobj\n");
  }

  const xrefStart = length;
  let xref = `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size ${objs.length} /Root ${catalog} 0 R /Info ${infoObj} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let pos = 0;
  for (const p of parts) { out.set(p, pos); pos += p.length; }
  return { bytes: out, coverPages: pageNums.length - slices.length, shotPages: slices.length };
}
