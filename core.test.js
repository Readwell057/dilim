'use strict';
// Çekirdek işleri gerçek ffmpeg ile dener: node test/core.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const assert = require('assert');
const jobs = require('../src/core/jobs');
const ff = require('../src/core/ffmpeg');
const fm = require('../src/core/formats');
const { Library } = require('../src/core/library');
const { jpegInfo } = require('../src/core/pdfwrite');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dilim-test-'));
const bin = ff.getFfmpegPath();
const gen = (args) => { const r = spawnSync(bin, ['-y', '-hide_banner', '-loglevel', 'error', ...args]); assert.strictEqual(r.status, 0, String(r.stderr)); };
let passed = 0;
const ok = (name) => { passed++; console.log('  ✓', name); };

(async () => {
  // örnek dosyalar
  const png = path.join(tmp, 'resim.png');
  gen(['-f', 'lavfi', '-i', 'color=c=red@0.5:s=320x200,format=rgba', '-frames:v', '1', png]);
  const png2 = path.join(tmp, 'ikinci.png');
  gen(['-f', 'lavfi', '-i', 'testsrc=s=200x300', '-frames:v', '1', png2]);
  const wav = path.join(tmp, 'ses.wav');
  gen(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', wav]);
  const mp4 = path.join(tmp, 'video.mp4');
  gen(['-f', 'lavfi', '-i', 'testsrc=s=320x240:d=6:r=15', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', mp4]);

  const S = { outputMode: 'same' };

  // biçim tespiti
  assert.strictEqual(fm.kindOf('a.JPG'), 'image');
  assert.strictEqual(fm.kindOf('a.flac'), 'audio');
  assert.strictEqual(fm.kindOf('a.mkv'), 'video');
  assert.strictEqual(fm.kindOf('a.pdf'), 'pdf');
  assert.strictEqual(fm.kindOf('a.xyz'), null);
  ok('dosya türü tespiti');

  // görsel dönüştürme: hepsi
  for (const t of fm.IMAGE_TARGETS.filter((x) => x !== 'png')) {
    const r = await jobs.convertFile({ input: png, kind: 'image', target: t, settings: S });
    assert.ok(r.out && fs.statSync(r.out).size > 100, t);
  }
  ok('görsel → ' + fm.IMAGE_TARGETS.filter((x) => x !== 'png').join(', '));

  // jpg'de saydam alan beyaza dönmeli
  const jpg = path.join(tmp, 'resim.jpg');
  const px = spawnSync(bin, ['-v', 'error', '-i', jpg, '-vf', 'format=rgb24,crop=1:1:5:5', '-f', 'rawvideo', '-']).stdout;
  assert.ok(px[0] > 200 && px[1] > 60, 'beyaz zemin: ' + [...px].join(','));
  ok('saydam PNG → JPG beyaz zemine oturuyor');

  // aynı biçim atlanır
  const sk = await jobs.convertFile({ input: png, kind: 'image', target: 'png', settings: S });
  assert.ok(sk.skipped);
  ok('aynı biçime çevirme atlanıyor');

  // üstüne yazmama
  const again = await jobs.convertFile({ input: png, kind: 'image', target: 'jpg', settings: S });
  assert.ok(/resim \(2\)\.jpg$/.test(again.out), again.out);
  ok('var olan dosyanın üstüne yazılmıyor');

  // ses
  for (const t of fm.AUDIO_TARGETS.filter((x) => x !== 'wav')) {
    const r = await jobs.convertFile({ input: wav, kind: 'audio', target: t, settings: S });
    assert.ok(fs.statSync(r.out).size > 500, t);
  }
  ok('ses → ' + fm.AUDIO_TARGETS.filter((x) => x !== 'wav').join(', '));

  // video
  for (const t of ['webm', 'gif']) {
    const r = await jobs.convertFile({ input: mp4, kind: 'video', target: t, settings: S });
    assert.ok(fs.statSync(r.out).size > 1000, t);
  }
  ok('video → webm, gif');
  const ex = await jobs.extractAudio({ input: mp4, target: 'mp3', settings: S });
  assert.ok(fs.statSync(ex.out).size > 1000);
  ok('videodan MP3 çıkarma');

  // ilerleme geri bildirimi
  const prog = [];
  await jobs.convertFile({ input: mp4, kind: 'video', target: 'webm', settings: { outputMode: 'same' }, onProgress: (p) => prog.push(p) });
  assert.ok(prog.length > 0 && prog.every((p) => p >= 0 && p < 1), 'ilerleme: ' + prog.length);
  ok('ilerleme bildirimi geliyor (' + prog.length + ' adım)');

  // kesme (yeniden kodlama + kayıpsız)
  for (const [file, copy] of [[mp4, false], [mp4, true], [wav, false], [wav, true]]) {
    const r = await jobs.trimFile({ input: file, start: 1, end: 3.5, copy, settings: S });
    const d = await ff.probeDuration(r.out);
    assert.ok(copy ? (d > 1.8 && d < 4.0) : (d > 2.2 && d < 2.9), path.basename(file) + ' copy=' + copy + ' süre=' + d);
  }
  ok('kesme: video/ses, hassas ve hızlı mod');

  // PDF
  const one = await jobs.imagesToPdf({ inputs: [png], merge: false, settings: S });
  const merged = await jobs.imagesToPdf({ inputs: [png, png2], merge: true, settings: S });
  const sep = await jobs.imagesToPdf({ inputs: [png, png2], merge: false, settings: S });
  assert.strictEqual(one.length, 1); assert.strictEqual(merged.length, 1); assert.strictEqual(sep.length, 2);
  const pi = spawnSync('pdfinfo', [merged[0].out]);
  if (!pi.error) {
    assert.ok(/Pages:\s+2/.test(pi.stdout.toString()), pi.stdout.toString());
    const rend = spawnSync('pdftoppm', ['-png', '-r', '50', merged[0].out, path.join(tmp, 'pg')]);
    assert.strictEqual(rend.status, 0);
    assert.ok(fs.existsSync(path.join(tmp, 'pg-1.png')) && fs.existsSync(path.join(tmp, 'pg-2.png')));
    ok('görsel → PDF (tek, birleşik, ayrı); PDF gerçekten açılıyor, 2 sayfa');
  } else {
    assert.ok(fs.statSync(merged[0].out).size > 500);
    ok('görsel → PDF (tek, birleşik, ayrı) üretildi (PDF okuyucu bu makinede yok, açma denemesi atlandı)');
  }

  // klasör ayarı
  const outd = path.join(tmp, 'cikti');
  const r2 = await jobs.convertFile({ input: png2, kind: 'image', target: 'webp', settings: { outputMode: 'folder', outputDir: outd } });
  assert.ok(r2.out.startsWith(outd));
  ok('çıktı klasörü ayarı çalışıyor');

  // iptal
  const ac = new AbortController();
  const p = jobs.convertFile({ input: mp4, kind: 'video', target: 'webm', settings: S, signal: ac.signal });
  setTimeout(() => ac.abort(), 150);
  let cancelled = false;
  try { await p; } catch (e) { cancelled = !!e.cancelled; }
  assert.ok(cancelled);
  ok('iptal çalışıyor');

  // bozuk dosya
  const bad = path.join(tmp, 'bozuk.png'); fs.writeFileSync(bad, 'bu bir resim değil');
  let msg = '';
  try { await jobs.convertFile({ input: bad, kind: 'image', target: 'jpg', settings: S }); } catch (e) { msg = e.message; }
  assert.ok(msg && !/undefined/.test(msg)); console.log('    bozuk dosya mesajı →', msg);
  ok('bozuk dosya anlaşılır hata veriyor');

  // kütüphane
  const lib = new Library(path.join(tmp, 'lib.json'));
  lib.add({ name: 'Çiçek.png', title: 'PNG → JPG', out: png });
  lib.add({ name: 'şarkı.wav', title: 'WAV → MP3', out: '/yok/yok.mp3' });
  assert.strictEqual(lib.list('ÇİÇEK').length, 1);
  assert.strictEqual(lib.list('')[1].exists, true);
  assert.strictEqual(lib.list('')[0].exists, false);
  const lib2 = new Library(path.join(tmp, 'lib.json'));
  assert.strictEqual(lib2.list('').length, 2);
  lib2.remove(lib2.list('')[0].id);
  assert.strictEqual(new Library(path.join(tmp, 'lib.json')).list('').length, 1);
  ok('kütüphane: ekle, ara (Türkçe harf duyarsız), kalıcı, sil');

  console.log('\n' + passed + ' test geçti');
  fs.rmSync(tmp, { recursive: true, force: true });
})().catch((e) => { console.error('\nBAŞARISIZ:', e.message); process.exit(1); });
