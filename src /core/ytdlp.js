'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const EXE = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const URL_LATEST = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/' + EXE;

function toolPath(toolsDir) { return path.join(toolsDir, EXE); }
function isInstalled(toolsDir) { return fs.existsSync(toolPath(toolsDir)); }

function isUrl(text) {
  return /^https?:\/\/[^\s]+$/i.test(String(text || '').trim());
}

/** yt-dlp'yi resmi GitHub sürümünden indirir. */
async function install(toolsDir, onProgress) {
  fs.mkdirSync(toolsDir, { recursive: true });
  const dest = toolPath(toolsDir);
  const tmp = dest + '.part';
  const res = await fetch(URL_LATEST, { redirect: 'follow' });
  if (!res.ok) throw new Error('İndirme aracı alınamadı (HTTP ' + res.status + '). İnternet bağlantını kontrol et.');
  const total = Number(res.headers.get('content-length')) || 0;
  const out = fs.createWriteStream(tmp);
  let got = 0;
  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.length;
      if (!out.write(Buffer.from(value))) await new Promise((r) => out.once('drain', r));
      if (total && onProgress) onProgress(got / total);
    }
    await new Promise((r, j) => { out.end(); out.on('finish', r); out.on('error', j); });
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) {}
    throw e;
  }
  if (fs.existsSync(dest)) fs.unlinkSync(dest);
  fs.renameSync(tmp, dest);
  if (process.platform !== 'win32') fs.chmodSync(dest, 0o755);
}

function runCapture(bin, args) {
  return new Promise((resolve) => {
    let out = '';
    let child;
    try { child = spawn(bin, args, { windowsHide: true }); } catch (e) { return resolve({ code: -1, out: e.message }); }
    child.on('error', (e) => resolve({ code: -1, out: e.message }));
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (code) => resolve({ code, out }));
  });
}

async function version(toolsDir) {
  if (!isInstalled(toolsDir)) return null;
  const r = await runCapture(toolPath(toolsDir), ['--version']);
  return r.code === 0 ? r.out.trim() : null;
}

async function update(toolsDir) {
  if (!isInstalled(toolsDir)) throw new Error('İndirme aracı kurulu değil.');
  const r = await runCapture(toolPath(toolsDir), ['-U']);
  if (r.code !== 0) throw new Error('Güncellenemedi: ' + r.out.split(/\r?\n/).filter(Boolean).pop());
  return version(toolsDir);
}

const QUALITY = {
  best: 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b',
  1080: 'bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080]/bv*[height<=1080]+ba/b',
  720: 'bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720]/bv*[height<=720]+ba/b',
  480: 'bv*[height<=480][ext=mp4]+ba[ext=m4a]/b[height<=480]/bv*[height<=480]+ba/b',
};

function friendly(tail) {
  if (/Unsupported URL/i.test(tail)) return 'Bu bağlantı desteklenmiyor.';
  if (/Private video|Sign in|login required/i.test(tail)) return 'Bu içerik herkese açık değil; giriş gerektiriyor.';
  if (/HTTP Error 429|Too Many Requests/i.test(tail)) return 'Site çok fazla istek aldı. Biraz sonra tekrar dene.';
  if (/Unable to download|getaddrinfo|Temporary failure|timed out/i.test(tail)) return 'Bağlantı kurulamadı. İnternetini kontrol et.';
  if (/Video unavailable|removed|not available/i.test(tail)) return 'İçerik artık mevcut değil.';
  const lines = tail.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return (lines[lines.length - 1] || 'İndirme başarısız').replace(/^ERROR:\s*/, '').slice(0, 220);
}

/**
 * Bağlantıdan medya indirir. mode: 'video' | 'audio'.
 * Ses modunda en iyi ses indirilir; MP3'e çevirmeyi çağıran yapar (dönen {file, needsAudioConvert}).
 */
function download({ toolsDir, ffmpegPath, url, mode, quality, outDir, onProgress, onStatus, signal }) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(outDir, { recursive: true });
    const listFile = path.join(toolsDir, 'last-' + Date.now() + '.txt');
    const args = [
      '--no-playlist', '--newline', '--windows-filenames', '--no-mtime', '--no-warnings',
      '--ffmpeg-location', ffmpegPath,
      '--print-to-file', 'after_move:filepath', listFile,
      '-o', path.join(outDir, '%(title).120B.%(ext)s'),
    ];
    if (mode === 'audio') args.push('-f', 'ba[ext=m4a]/ba/b');
    else args.push('-f', QUALITY[quality] || QUALITY.best, '--merge-output-format', 'mp4');
    args.push(url);

    let child;
    try { child = spawn(toolPath(toolsDir), args, { windowsHide: true }); } catch (e) { return reject(e); }
    let tail = '';
    let cancelled = false;
    const onLine = (line) => {
      const m = /\[download\]\s+(\d+(?:\.\d+)?)%/.exec(line);
      if (m && onProgress) onProgress(Math.min(0.99, parseFloat(m[1]) / 100));
      else if (/\[Merger\]|\[ExtractAudio\]|\[Fixup/.test(line) && onStatus) onStatus('Birleştiriliyor…');
      else if (/Destination:/.test(line) && onStatus) onStatus('İndiriliyor…');
    };
    let buf = '';
    const feed = (d) => {
      const s = d.toString();
      tail = (tail + s).slice(-4000);
      buf += s;
      let i;
      while ((i = buf.search(/[\r\n]/)) >= 0) { onLine(buf.slice(0, i)); buf = buf.slice(i + 1); }
    };
    child.stdout.on('data', feed);
    child.stderr.on('data', feed);
    child.on('error', (e) => reject(new Error('İndirme aracı çalıştırılamadı: ' + e.message)));
    if (signal) {
      const onAbort = () => { cancelled = true; child.kill(); };
      if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true });
    }
    child.on('close', (code) => {
      let file = null;
      try { file = fs.readFileSync(listFile, 'utf8').split(/\r?\n/).filter(Boolean).pop() || null; fs.unlinkSync(listFile); } catch (_) {}
      if (cancelled) return reject(Object.assign(new Error('İptal edildi'), { cancelled: true }));
      if (code !== 0 || !file) return reject(new Error(friendly(tail)));
      resolve({ file, needsAudioConvert: mode === 'audio' });
    });
  });
}

module.exports = { isUrl, isInstalled, install, version, update, download, toolPath };
