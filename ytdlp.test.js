'use strict';
// Sahte yt-dlp ile indirme akışını (ilerleme, dosya yolu, hata mesajı) dener.
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const y = require('../src/core/ytdlp');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dilim-yt-'));
const tools = path.join(dir, 'tools'); fs.mkdirSync(tools);
const outDir = path.join(dir, 'out');
fs.writeFileSync(y.toolPath(tools), `#!/bin/sh
for a in "$@"; do last="$a"; done
prev=""; LIST=""; OUT=""
for a in "$@"; do
  if [ "$prev" = "after_move:filepath" ]; then LIST="$a"; fi
  prev="$a"
done
if echo "$last" | grep -q fail; then echo "ERROR: Unsupported URL: $last" >&2; exit 1; fi
echo "[download] Destination: x.mp4"
for p in 10.0 55.5 100; do printf "[download]  $p%% of 10.00MiB at 1.00MiB/s ETA 00:01\\n"; done
echo "[Merger] Merging formats into x.mp4"
mkdir -p "${outDir}"; echo hi > "${outDir}/Video Adı.mp4"
echo "${outDir}/Video Adı.mp4" > "$LIST"
exit 0
`, { mode: 0o755 });
(async () => {
  const seen = []; const st = [];
  const r = await y.download({ toolsDir: tools, ffmpegPath: 'ffmpeg', url: 'https://ornek.com/v', mode: 'video', quality: '720', outDir, onProgress: (f) => seen.push(f), onStatus: (s) => st.push(s) });
  assert.ok(r.file.endsWith('Video Adı.mp4')); assert.ok(seen.includes(0.555) && seen.at(-1) <= 0.99); assert.ok(st.includes('Birleştiriliyor…'));
  console.log('  ✓ indirme: ilerleme, durum ve dosya yolu okunuyor');
  let msg = ''; try { await y.download({ toolsDir: tools, ffmpegPath: 'ffmpeg', url: 'https://ornek.com/fail', mode: 'audio', outDir }); } catch (e) { msg = e.message; }
  assert.strictEqual(msg, 'Bu bağlantı desteklenmiyor.'); console.log('  ✓ hata mesajı Türkçe ve anlaşılır');
  assert.ok(y.isUrl('https://youtu.be/abc') && !y.isUrl('merhaba') && !y.isUrl('ftp://x'));
  console.log('  ✓ bağlantı denetimi'); fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => { console.error('BAŞARISIZ:', e.message); process.exit(1); });
