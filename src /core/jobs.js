'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const ff = require('./ffmpeg');
const { uniquePath, baseName } = require('./util');
const { normExt, extOf } = require('./formats');
const { buildPdfFromJpegs } = require('./pdfwrite');

function outFolder(input, settings) {
  if (settings && settings.outputMode === 'folder' && settings.outputDir) {
    fs.mkdirSync(settings.outputDir, { recursive: true });
    return settings.outputDir;
  }
  return path.dirname(input);
}

/** Tek dosyayı hedef biçime çevirir. */
async function convertFile({ input, kind, target, settings, onProgress, signal }) {
  if (normExt(extOf(input)) === target) {
    return { skipped: true, reason: 'Zaten ' + target.toUpperCase() };
  }
  const dir = outFolder(input, settings);
  const out = uniquePath(dir, baseName(input), target);
  const args = ff.buildConvertArgs(kind, target, input, out);
  try {
    await ff.runFfmpeg(args, { onProgress, signal });
  } catch (e) {
    try { fs.unlinkSync(out); } catch (_) {}
    throw e;
  }
  return { out };
}

/** Videodan ses çıkarır. */
async function extractAudio({ input, target, settings, onProgress, signal }) {
  const dir = outFolder(input, settings);
  const out = uniquePath(dir, baseName(input), target);
  try {
    await ff.runFfmpeg(ff.buildExtractArgs(target, input, out), { onProgress, signal });
  } catch (e) {
    try { fs.unlinkSync(out); } catch (_) {}
    throw e;
  }
  return { out };
}

/** Bir veya birden çok görseli PDF yapar. merge=true → tek PDF. */
async function imagesToPdf({ inputs, merge, settings, onProgress, signal }) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dilim-'));
  const results = [];
  try {
    const jpgs = [];
    for (let i = 0; i < inputs.length; i++) {
      const tmp = path.join(tmpDir, i + '.jpg');
      await ff.runFfmpeg(ff.buildConvertArgs('image', 'jpg', inputs[i], tmp), { signal });
      jpgs.push({ input: inputs[i], data: fs.readFileSync(tmp) });
      if (onProgress) onProgress((i + 1) / inputs.length * 0.9);
    }
    if (merge || jpgs.length === 1) {
      const dir = outFolder(inputs[0], settings);
      const name = jpgs.length > 1 ? baseName(inputs[0]) + ' ve ' + (jpgs.length - 1) + ' görsel' : baseName(inputs[0]);
      const out = uniquePath(dir, name, 'pdf');
      fs.writeFileSync(out, buildPdfFromJpegs(jpgs));
      results.push({ out, inputs });
    } else {
      for (const j of jpgs) {
        const out = uniquePath(outFolder(j.input, settings), baseName(j.input), 'pdf');
        fs.writeFileSync(out, buildPdfFromJpegs([j]));
        results.push({ out, inputs: [j.input] });
      }
    }
    if (onProgress) onProgress(1);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
  return results;
}

/** Ses/videodan bir bölüm keser. */
async function trimFile({ input, start, end, copy, settings, onProgress, signal }) {
  const ext = extOf(input);
  const dir = outFolder(input, settings);
  const out = uniquePath(dir, baseName(input) + ' (kesit)', ext);
  const args = ff.buildTrimArgs({ input, output: out, start, end, ext, copy });
  try {
    await ff.runFfmpeg(args, { onProgress, duration: end - start, signal });
  } catch (e) {
    try { fs.unlinkSync(out); } catch (_) {}
    throw e;
  }
  return { out };
}

module.exports = { convertFile, extractAudio, imagesToPdf, trimFile, outFolder };
