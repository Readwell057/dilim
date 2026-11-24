'use strict';
// Bağımlılıksız, en sade PDF yazıcı: her sayfa tek bir JPEG görsel.

function jpegInfo(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('JPEG değil');
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xff) { i++; continue; }
    if (marker >= 0xd0 && marker <= 0xd9) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    const isSOF = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSOF) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), components: buf[i + 9] };
    }
    i += 2 + len;
  }
  throw new Error('JPEG boyutu okunamadı');
}

/** items: [{ data: Buffer(JPEG) }]. Sayfa boyutu görselin piksel boyutu × 0.75 pt. */
function buildPdfFromJpegs(items) {
  if (!items.length) throw new Error('Görsel yok');
  const parts = [];
  const offsets = [];
  let pos = 0;
  const push = (b) => { const buf = Buffer.isBuffer(b) ? b : Buffer.from(b, 'latin1'); parts.push(buf); pos += buf.length; };
  const obj = (n, body) => { offsets[n] = pos; push(`${n} 0 obj\n`); push(body); push('\nendobj\n'); };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const n = items.length;
  // 1: katalog, 2: sayfalar, sonra her sayfa için 3 nesne (sayfa, görsel, içerik)
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  const kids = items.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  obj(2, `<< /Type /Pages /Count ${n} /Kids [${kids}] >>`);
  items.forEach((it, i) => {
    const info = jpegInfo(it.data);
    const w = +(info.width * 0.75).toFixed(2);
    const h = +(info.height * 0.75).toFixed(2);
    const pageN = 3 + i * 3, imgN = pageN + 1, contN = pageN + 2;
    const cs = info.components === 1 ? '/DeviceGray' : info.components === 4 ? '/DeviceCMYK' : '/DeviceRGB';
    obj(pageN, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${imgN} 0 R >> >> /Contents ${contN} 0 R >>`);
    offsets[imgN] = pos;
    push(`${imgN} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode /Length ${it.data.length} >>\nstream\n`);
    push(it.data);
    push('\nendstream\nendobj\n');
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    obj(contN, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  const total = 3 + n * 3;
  const xrefPos = pos;
  let xref = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let k = 1; k < total; k++) xref += String(offsets[k]).padStart(10, '0') + ' 00000 n \n';
  push(xref);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);
  return Buffer.concat(parts);
}

module.exports = { jpegInfo, buildPdfFromJpegs };
