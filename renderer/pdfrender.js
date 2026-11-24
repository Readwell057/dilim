// PDF sayfalarını görsele çevirir (pdf.js ile). Yalnızca PDF → görsel işinde yüklenir.
import * as pdfjs from '../node_modules/pdfjs-dist/legacy/build/pdf.min.mjs';

const base = (p) => new URL('../node_modules/pdfjs-dist/' + p, import.meta.url).href;
pdfjs.GlobalWorkerOptions.workerSrc = base('legacy/build/pdf.worker.min.mjs');

const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

export async function renderPdf(bytes, { ext, onPage, isCancelled }) {
  const loading = pdfjs.getDocument({
    data: bytes,
    cMapUrl: base('cmaps/'), cMapPacked: true,
    standardFontDataUrl: base('standard_fonts/'),
    iccUrl: base('iccs/'), wasmUrl: base('wasm/'),
  });
  const doc = await loading.promise;
  const n = doc.numPages;
  try {
    for (let i = 1; i <= n; i++) {
      if (isCancelled && isCancelled()) throw Object.assign(new Error('İptal edildi'), { cancelled: true });
      const page = await doc.getPage(i);
      const base1 = page.getViewport({ scale: 1 });
      const scale = Math.min(2, 4000 / Math.max(base1.width, base1.height)); // ≈144 dpi, en çok 4000 px
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const blob = await new Promise((r) => canvas.toBlob(r, MIME[ext], 0.92));
      if (!blob) throw new Error('Sayfa görsele çevrilemedi.');
      await onPage(i, n, new Uint8Array(await blob.arrayBuffer()));
      page.cleanup(); canvas.width = canvas.height = 0;
    }
  } finally { try { await loading.destroy(); } catch (_) { /* kapanış hatası önemsiz */ } }
  return n;
}
