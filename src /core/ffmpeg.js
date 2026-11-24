'use strict';
const { spawn } = require('child_process');

function getFfmpegPath() {
  if (process.env.DILIM_FFMPEG) return process.env.DILIM_FFMPEG;
  try {
    const p = require('ffmpeg-static');
    if (p) return p;
  } catch (_) { /* geliştirme ortamında PATH'teki ffmpeg kullanılır */ }
  return 'ffmpeg';
}

function friendlyError(tail) {
  const lines = String(tail || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1] || 'Bilinmeyen hata';
  if (/Invalid data found|moov atom|could not find codec/i.test(tail)) return 'Dosya bozuk ya da desteklenmeyen bir biçimde.';
  if (/Permission denied/i.test(tail)) return 'Dosyaya erişim izni yok.';
  if (/No such file/i.test(tail)) return 'Dosya bulunamadı.';
  if (/Unknown encoder|Encoder .* not found/i.test(tail)) return 'Bu biçim için gereken kodlayıcı bu sürümde yok.';
  return last.slice(0, 200);
}

/**
 * ffmpeg çalıştırır. onProgress(0..1) çağrılır. signal.abort() ile iptal edilir.
 */
function runFfmpeg(args, opts = {}) {
  const bin = opts.ffmpegPath || getFfmpegPath();
  const full = ['-hide_banner', '-nostdin', '-y', '-progress', 'pipe:1', '-nostats', ...args];
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(bin, full, { windowsHide: true });
    } catch (e) {
      return reject(new Error('ffmpeg başlatılamadı: ' + e.message));
    }
    let duration = opts.duration || 0;
    let tail = '';
    let cancelled = false;
    child.on('error', (e) => reject(new Error('ffmpeg bulunamadı: ' + e.message)));
    child.stderr.on('data', (d) => {
      const s = d.toString();
      tail = (tail + s).slice(-4000);
      if (!duration) {
        const m = /Duration:\s*(\d+):(\d+):(\d+\.?\d*)/.exec(s);
        if (m) duration = +m[1] * 3600 + +m[2] * 60 + +m[3];
      }
    });
    let buf = '';
    child.stdout.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        const m = /^out_time_(?:us|ms)=(\d+)/.exec(line);
        if (m && duration && opts.onProgress) opts.onProgress(Math.min(0.99, Number(m[1]) / 1e6 / duration));
      }
    });
    if (opts.signal) {
      const onAbort = () => { cancelled = true; child.kill(); };
      if (opts.signal.aborted) onAbort();
      else opts.signal.addEventListener('abort', onAbort, { once: true });
    }
    child.on('close', (code) => {
      if (cancelled) return reject(Object.assign(new Error('İptal edildi'), { cancelled: true }));
      if (code === 0) return resolve();
      reject(new Error(friendlyError(tail)));
    });
  });
}

/** Giriş dosyasının süresini (sn) ffmpeg -i çıktısından okur. */
function probeDuration(input, opts = {}) {
  const bin = opts.ffmpegPath || getFfmpegPath();
  return new Promise((resolve) => {
    let out = '';
    let child;
    try { child = spawn(bin, ['-hide_banner', '-i', input], { windowsHide: true }); } catch (_) { return resolve(0); }
    child.on('error', () => resolve(0));
    child.stderr.on('data', (d) => (out += d.toString()));
    child.on('close', () => {
      const m = /Duration:\s*(\d+):(\d+):(\d+\.?\d*)/.exec(out);
      resolve(m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0);
    });
  });
}

const AUDIO_CODEC = {
  mp3: ['-c:a', 'libmp3lame', '-q:a', '2'],
  wav: ['-c:a', 'pcm_s16le'],
  flac: ['-c:a', 'flac'],
  ogg: ['-c:a', 'libvorbis', '-q:a', '5'],
  m4a: ['-c:a', 'aac', '-b:a', '192k'],
  opus: ['-c:a', 'libopus', '-b:a', '128k'],
};

const FLATTEN_WHITE = 'split[s][o];[s]drawbox=x=0:y=0:w=iw:h=ih:t=fill:c=white[bg];[bg][o]overlay=format=auto';

/** Dönüştürme argümanları. kind: giriş türü, target: hedef uzantı */
function buildConvertArgs(kind, target, input, output) {
  const a = ['-i', input];
  if (kind === 'image') {
    if (target === 'ico') {
      return ['-i', input, '-vf', "scale='min(256,iw)':'min(256,ih)':force_original_aspect_ratio=decrease,format=bgra", '-frames:v', '1', '-update', '1', output];
    }
    switch (target) {
      case 'jpg': a.push('-vf', FLATTEN_WHITE + ',format=yuvj420p', '-q:v', '2'); break;
      case 'png': a.push('-c:v', 'png'); break;
      case 'webp': a.push('-c:v', 'libwebp', '-quality', '90'); break;
      case 'bmp': a.push('-c:v', 'bmp'); break;
      case 'gif': a.push('-c:v', 'gif'); break;
      case 'tiff': a.push('-c:v', 'tiff'); break;
      default: throw new Error('Desteklenmeyen hedef: ' + target);
    }
    a.push('-frames:v', '1', '-update', '1');
    a.push(output);
    return a;
  }
  if (kind === 'audio') {
    if (!AUDIO_CODEC[target]) throw new Error('Desteklenmeyen hedef: ' + target);
    a.push('-vn', ...AUDIO_CODEC[target], output);
    return a;
  }
  if (kind === 'video') {
    if (target === 'mp4') {
      a.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', output);
    } else if (target === 'webm') {
      a.push('-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-c:a', 'libopus', '-b:a', '128k', output);
    } else if (target === 'gif') {
      a.push('-an', '-vf', 'fps=12,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse', '-loop', '0', output);
    } else {
      throw new Error('Desteklenmeyen hedef: ' + target);
    }
    return a;
  }
  throw new Error('Desteklenmeyen tür: ' + kind);
}

/** Videodan/sesten yalnızca ses çıkar. */
function buildExtractArgs(target, input, output) {
  if (!AUDIO_CODEC[target]) throw new Error('Desteklenmeyen hedef: ' + target);
  return ['-i', input, '-vn', ...AUDIO_CODEC[target], output];
}

/** Kesme argümanları. copy=true → kayıpsız ve hızlı, ama başlangıç kareye yakın olur. */
function buildTrimArgs({ input, output, start, end, ext, copy }) {
  const dur = Math.max(0.05, end - start);
  const a = ['-ss', String(start), '-i', input, '-t', String(dur)];
  if (copy) {
    a.push('-c', 'copy', '-avoid_negative_ts', 'make_zero', output);
    return a;
  }
  const e = String(ext).toLowerCase();
  if (AUDIO_CODEC[e]) a.push('-vn', ...AUDIO_CODEC[e]);
  else if (e === 'aac') a.push('-vn', '-c:a', 'aac', '-b:a', '192k');
  else if (['mp4', 'm4v', 'mov', 'mkv'].includes(e)) a.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k');
  else if (e === 'webm') a.push('-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-c:a', 'libopus');
  a.push(output);
  return a;
}

module.exports = { getFfmpegPath, runFfmpeg, probeDuration, buildConvertArgs, buildExtractArgs, buildTrimArgs };
