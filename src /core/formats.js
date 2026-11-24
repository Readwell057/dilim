'use strict';
const path = require('path');

const EXT = {
  image: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'tif', 'tiff', 'ico'],
  audio: ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'opus', 'wma'],
  video: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'm4v', 'wmv', 'flv'],
  pdf: ['pdf'],
};

const KIND_LABEL = { image: 'görsel', audio: 'ses', video: 'video', pdf: 'PDF' };

function extOf(file) {
  return path.extname(file).slice(1).toLowerCase();
}

function normExt(e) {
  e = String(e || '').toLowerCase();
  if (e === 'jpeg') return 'jpg';
  if (e === 'tif') return 'tiff';
  return e;
}

function kindOf(file) {
  const e = extOf(file);
  for (const k of Object.keys(EXT)) if (EXT[k].includes(e)) return k;
  return null;
}

const IMAGE_TARGETS = ['jpg', 'png', 'webp', 'bmp', 'gif', 'tiff', 'ico'];
const AUDIO_TARGETS = ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'opus'];

/**
 * Çarkta gösterilecek eylemler.
 * type: convert | topdf | extract | trim | pdf2img
 */
function actionsFor(kind, files) {
  const count = files.length;
  const first = normExt(extOf(files[0] || ''));
  const same = count === 1 ? first : null;
  const out = [];
  if (kind === 'image') {
    IMAGE_TARGETS.filter((t) => t !== same).forEach((t) =>
      out.push({ id: 'convert:' + t, type: 'convert', target: t, label: t.toUpperCase(), hint: t.toUpperCase() + ' olarak kaydet' })
    );
    out.push({ id: 'topdf', type: 'topdf', target: 'pdf', label: 'PDF', hint: 'PDF belgesine çevir' });
  } else if (kind === 'audio') {
    out.push({ id: 'trim', type: 'trim', label: 'Kes', hint: 'Sesin bir bölümünü kes', disabled: count !== 1, disabledHint: 'Kesmek için tek dosya seç' });
    AUDIO_TARGETS.filter((t) => t !== same).forEach((t) =>
      out.push({ id: 'convert:' + t, type: 'convert', target: t, label: t.toUpperCase(), hint: t.toUpperCase() + ' olarak kaydet' })
    );
  } else if (kind === 'video') {
    out.push({ id: 'trim', type: 'trim', label: 'Kes', hint: 'Videonun bir bölümünü kes', disabled: count !== 1, disabledHint: 'Kesmek için tek dosya seç' });
    [['mp4', 'MP4'], ['webm', 'WEBM'], ['gif', 'GIF']]
      .filter(([t]) => t !== same)
      .forEach(([t, l]) => out.push({ id: 'convert:' + t, type: 'convert', target: t, label: l, hint: l + ' olarak kaydet' }));
    ['mp3', 'm4a', 'wav'].forEach((t) =>
      out.push({ id: 'extract:' + t, type: 'extract', target: t, label: t.toUpperCase(), sub: 'ses', hint: 'Sesi ' + t.toUpperCase() + ' olarak çıkar' })
    );
  } else if (kind === 'pdf') {
    ['png', 'jpg', 'webp'].forEach((t) =>
      out.push({ id: 'pdf2img:' + t, type: 'pdf2img', target: t, label: t.toUpperCase(), sub: 'sayfalar', hint: 'Her sayfayı ' + t.toUpperCase() + ' görseli yap' })
    );
  }
  return out;
}

module.exports = { EXT, KIND_LABEL, extOf, normExt, kindOf, actionsFor, IMAGE_TARGETS, AUDIO_TARGETS };
