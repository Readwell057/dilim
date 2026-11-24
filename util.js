'use strict';
const fs = require('fs');
const path = require('path');

/** Var olan dosyanın üstüne yazmamak için "ad (2).uzantı" üretir. */
function uniquePath(dir, base, ext) {
  const dot = ext ? '.' + ext.replace(/^\./, '') : '';
  let p = path.join(dir, base + dot);
  let i = 2;
  while (fs.existsSync(p)) {
    p = path.join(dir, `${base} (${i})${dot}`);
    i++;
  }
  return p;
}

function baseName(file) {
  return path.basename(file, path.extname(file));
}

function sanitize(name) {
  return String(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim().slice(0, 150) || 'dosya';
}

function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return String(m).padStart(2, '0') + ':' + s.toFixed(1).padStart(4, '0');
}

module.exports = { uniquePath, baseName, sanitize, fmtTime };
