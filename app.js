(() => {
'use strict';
const api = window.dilim;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
if (!api) { document.body.textContent = 'Dilim yalnızca masaüstü uygulaması olarak çalışır.'; return; }

const KIND_TR = { image: 'görsel', audio: 'ses', video: 'video', pdf: 'PDF' };
const KIND_TAG = { image: 'GÖR', audio: 'SES', video: 'VİD', pdf: 'PDF' };
const state = { files: [], kind: null, view: 'home', settings: {}, merge: false };

/* ---------- Yardımcılar ---------- */
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}
const fmtSize = (b) => !b ? '' : b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : b < 1073741824 ? (b / 1048576).toFixed(1) + ' MB' : (b / 1073741824).toFixed(2) + ' GB';
const fmtT = (s) => { s = Math.max(0, s || 0); const m = Math.floor(s / 60); return String(m).padStart(2, '0') + ':' + (s - m * 60).toFixed(1).padStart(4, '0'); };
function parseT(str) {
  const p = String(str).trim().replace(',', '.').split(':').map(Number);
  if (!p.length || p.some((x) => !isFinite(x) || x < 0)) return null;
  return p.reduce((a, x) => a * 60 + x, 0);
}
function fmtWhen(ts) {
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return 'az önce'; if (d < 3600) return Math.floor(d / 60) + ' dk önce';
  if (d < 86400) return Math.floor(d / 3600) + ' sa önce'; if (d < 172800) return 'dün';
  return new Date(ts).toLocaleDateString('tr-TR');
}
let toastTimer;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800); }
const isTyping = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);

/* ---------- Görünümler ---------- */
function show(view) {
  state.view = view;
  $$('.view').forEach((v) => (v.hidden = v.id !== 'view-' + view));
  $$('.nav').forEach((n) => n.classList.toggle('active', n.dataset.view === view || (view === 'trim' && n.dataset.view === 'home')));
  if (view === 'library') loadLibrary();
  if (view === 'download') enterDownload();
  if (view === 'settings') enterSettings();
}
$$('.nav').forEach((n) => n.addEventListener('click', () => show(n.dataset.view)));

/* ---------- Görev kuyruğu ---------- */
const tasks = new Map();
let taskSeq = 0;
function addTask(title, idOverride) {
  const id = idOverride || 'job' + Date.now().toString(36) + (taskSeq++);
  const fg = h('div', { class: 'bar-fg indet' });
  const st = h('span', { class: 'st' }, 'Başlıyor…');
  const acts = h('div', { class: 'acts' });
  const cancel = h('button', { class: 'ghost small', onclick: () => api.cancel(id) }, 'Vazgeç');
  const x = h('button', { class: 'x', 'aria-label': 'Kapat', onclick: () => { el.remove(); tasks.delete(id); } }, '×');
  const el = h('div', { class: 'task' }, h('div', { class: 'top' }, h('span', { class: 'ttl', title }, title), x), st, h('div', { class: 'bar-bg' }, fg), acts);
  acts.append(cancel);
  $('#queue').append(el);
  while ($('#queue').children.length > 5) $('#queue').firstChild.remove();
  const t = {
    id,
    update(m) {
      if (m.fraction == null) fg.classList.add('indet'); else { fg.classList.remove('indet'); fg.style.width = Math.round(m.fraction * 100) + '%'; }
      st.textContent = m.status || (m.total > 1 ? `${m.index + 1}/${m.total} · ` : '') + (m.fraction != null ? Math.round(m.fraction * 100) + '%' : '');
    },
    fail(msg) { el.classList.add('err'); el.classList.add('done'); st.textContent = msg; acts.replaceChildren(); },
    finish(res) {
      if (!res || res.error) return t.fail((res && res.error) || 'Bilinmeyen hata');
      if (res.cancelled) return t.fail('İptal edildi');
      const rs = res.results || [], outs = rs.filter((r) => r.out), skipped = rs.filter((r) => r.skipped), errs = rs.filter((r) => r.error);
      el.classList.add('done'); acts.replaceChildren();
      if (!outs.length && errs.length) return t.fail(errs[0].error);
      st.textContent = outs.length ? (outs.length > 1 ? outs.length + ' dosya hazır' : 'Hazır') : 'Yapılacak bir şey yok';
      if (outs.length === 1) acts.append(h('button', { class: 'ghost small', onclick: () => api.open(outs[0].out) }, 'Aç'));
      if (outs.length) acts.append(h('button', { class: 'ghost small', onclick: () => api.reveal(outs[0].out) }, 'Klasörde göster'));
      const notes = [];
      if (skipped.length) notes.push(skipped.length + ' dosya atlandı (' + skipped[0].skipped + ')');
      if (errs.length) notes.push(errs.length + ' dosyada hata: ' + errs[0].error);
      if (notes.length) el.append(h('div', { class: 'st' }, notes.join(' · ')));
      if (!notes.length && outs.length) setTimeout(() => { if (el.isConnected) { el.remove(); tasks.delete(id); } }, 30000);
    },
  };
  tasks.set(id, t);
  return t;
}
api.onProgress((m) => { const t = tasks.get(m.jobId); if (t) t.update(m); });

/* ---------- Çark ---------- */
const NS = 'http://www.w3.org/2000/svg';
const CX = 260, CY = 260, R0 = 112, R1 = 240;
function S(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v); if (parent) parent.append(e); return e; }
function sector(a0, a1, r0, r1) {
  const p = (r, a) => [CX + r * Math.cos(a), CY + r * Math.sin(a)].map((n) => n.toFixed(2));
  const [x1, y1] = p(r1, a0), [x2, y2] = p(r1, a1), [x3, y3] = p(r0, a1), [x4, y4] = p(r0, a0);
  const big = a1 - a0 > Math.PI ? 1 : 0;
  return `M${x1} ${y1}A${r1} ${r1} 0 ${big} 1 ${x2} ${y2}L${x3} ${y3}A${r0} ${r0} 0 ${big} 0 ${x4} ${y4}Z`;
}
let hubT, hubS, hubDefault = ['', ''];
function setHub(t, s) { hubT.textContent = t; hubS.textContent = s || ''; }

function renderWheel(actions, animate) {
  const w = $('#wheel'); w.replaceChildren();
  const idle = !actions;
  const list = idle ? Array.from({ length: 8 }, () => ({})) : actions;
  const n = list.length, step = (Math.PI * 2) / n, gap = 0.03;
  list.forEach((a, i) => {
    const mid = -Math.PI / 2 + i * step;
    const g = S('g', { class: 'seg ' + (idle ? 'idle' : a.disabled ? 'off' : 'on' + (i % 2 ? ' alt' : '')) + (animate ? ' open' : ''), style: `--i:${i};--dx:${(Math.cos(mid) * 9).toFixed(1)}px;--dy:${(Math.sin(mid) * 9).toFixed(1)}px` }, w);
    const body = S('g', { class: 'body' }, g);
    S('path', { d: sector(mid - step / 2 + gap, mid + step / 2 - gap, R0, R1) }, body);
    if (idle) return;
    const lx = CX + 176 * Math.cos(mid), ly = CY + 176 * Math.sin(mid);
    const t1 = S('text', { class: 'lab', x: lx, y: a.sub ? ly - 2 : ly + 8 }, body); t1.textContent = a.label;
    if (a.sub) { const t2 = S('text', { class: 'sub', x: lx, y: ly + 16 }, body); t2.textContent = a.sub; }
    g.setAttribute('role', 'button'); g.setAttribute('tabindex', a.disabled ? '-1' : '0'); g.setAttribute('aria-label', a.hint || a.label);
    if (a.disabled) g.setAttribute('aria-disabled', 'true');
    const hover = () => setHub(a.label, a.disabled ? a.disabledHint : a.hint);
    g.addEventListener('mouseenter', hover); g.addEventListener('focus', hover);
    g.addEventListener('mouseleave', () => setHub(...hubDefault)); g.addEventListener('blur', () => setHub(...hubDefault));
    const go = () => (a.disabled ? toast(a.disabledHint || 'Bu eylem şu an kullanılamıyor') : runAction(a));
    g.addEventListener('click', go);
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      const segs = $$('.seg.on', w), k = segs.indexOf(g);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); segs[(k + 1) % segs.length].focus(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); segs[(k - 1 + segs.length) % segs.length].focus(); }
    });
  });
  const hub = S('g', { class: idle ? 'hub-btn' : '' }, w);
  S('circle', { class: 'hub', cx: CX, cy: CY, r: R0 - 14 }, hub);
  hubT = S('text', { class: 'hub-title', x: CX, y: CY - 2 }, hub);
  hubS = S('text', { class: 'hub-sub', x: CX, y: CY + 22 }, hub);
  if (idle) { hubDefault = ['Buraya bırak', 'ya da tıkla']; hub.addEventListener('click', pickFiles); }
  setHub(...hubDefault);
}

async function updateHome(animate) {
  const files = state.files;
  const has = files.length > 0;
  $('#selection').hidden = !has; $('#home-hint').hidden = has;
  const kinds = [...new Set(files.map((f) => f.kind))];
  const tabs = $('#kind-tabs'); tabs.replaceChildren(); tabs.hidden = kinds.length < 2;
  if (!has) { state.kind = null; hubDefault = ['Buraya bırak', 'ya da tıkla']; return renderWheel(null, false); }
  if (!kinds.includes(state.kind)) state.kind = kinds[0];
  kinds.forEach((k) => tabs.append(h('button', { 'aria-pressed': String(k === state.kind), onclick: () => { state.kind = k; updateHome(false); } }, files.filter((f) => f.kind === k).length + ' ' + KIND_TR[k])));
  const mine = files.filter((f) => f.kind === state.kind);
  const names = mine.map((f) => f.name);
  $('#sel-names').textContent = names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : '') + (mine.length === 1 && mine[0].size ? ' · ' + fmtSize(mine[0].size) : '');
  $('#merge-opt').hidden = !(state.kind === 'image' && mine.length > 1);
  const actions = await api.actions(state.kind, mine.map((f) => f.path));
  hubDefault = [mine.length + ' ' + KIND_TR[state.kind], 'Bir dilim seç'];
  renderWheel(actions, animate);
}

async function addFiles(infos) {
  infos = (infos || []).filter(Boolean);
  const ok = infos.filter((f) => f.kind);
  if (infos.length - ok.length > 0) toast((infos.length - ok.length) + ' dosya desteklenmiyor, atlandı');
  if (!ok.length) return;
  const wasEmpty = state.files.length === 0;
  ok.forEach((f) => { if (!state.files.some((x) => x.path === f.path)) state.files.push(f); });
  if (state.view !== 'home') show('home');
  await updateHome(wasEmpty);
}
async function pickFiles() { const r = await api.pickFiles(); if (Array.isArray(r) && r.length) addFiles(r); }
$('#pick').addEventListener('click', pickFiles);
$('#sel-clear').addEventListener('click', () => { state.files = []; updateHome(false); });
$('#merge').addEventListener('change', (e) => (state.merge = e.target.checked));
api.onOpenFiles(async (paths) => addFiles(await api.inspect(paths)));

/* ---------- Eylemler ---------- */
async function runAction(a) {
  const mine = state.files.filter((f) => f.kind === state.kind);
  const paths = mine.map((f) => f.path);
  if (a.type === 'trim') return openTrim(mine[0]);
  if (a.type === 'pdf2img') return runPdfToImages(mine, a.target);
  const title = (mine.length > 1 ? mine.length + ' dosya' : mine[0].name) + ' → ' + a.label + (a.sub ? ' ' + a.sub : '');
  const t = addTask(title);
  t.finish(await api.convert({ jobId: t.id, kind: state.kind, files: paths, action: { type: a.type, target: a.target }, merge: state.merge }));
}

async function runPdfToImages(files, ext) {
  let pdfmod;
  for (const f of files) {
    const t = addTask(f.name + ' → ' + ext.toUpperCase() + ' sayfalar');
    let cancelled = false;
    t.cancelHook = () => (cancelled = true);
    const cancelBtn = $$('.task').pop().querySelector('.acts button'); if (cancelBtn) cancelBtn.onclick = () => (cancelled = true);
    try {
      pdfmod = pdfmod || await import('./pdfrender.js');
      const bytes = await api.readFile(f.path);
      if (bytes && bytes.error) throw new Error(bytes.error);
      let folder = null, last = null;
      const total = await pdfmod.renderPdf(bytes, {
        ext, isCancelled: () => cancelled,
        onPage: async (i, n, data) => {
          const r = await api.savePdfPages({ src: f.path, ext, page: i, pages: n, data, folder });
          if (r.error) throw new Error(r.error);
          folder = r.folder; last = r;
          t.update({ fraction: i / n, index: 0, total: 1, status: `Sayfa ${i}/${n}` });
        },
      });
      await api.savePdfPages({ finish: true, src: f.path, ext, pages: total, folder });
      t.finish({ results: [{ out: folder }] });
    } catch (e) {
      t.fail(e.cancelled ? 'İptal edildi' : 'PDF okunamadı: ' + (e.message || e));
    }
  }
}

/* ---------- Kesme ---------- */
const trim = { file: null, dur: 0, start: 0, end: 0, media: null };
async function openTrim(file) {
  trim.file = file; trim.dur = 0; trim.media = null;
  show('trim');
  $('#trim-title').textContent = 'Kes · ' + file.name;
  const box = $('#trim-media'); box.replaceChildren();
  $('#trim-note').hidden = true; $('#t-save').disabled = true;
  const [dur, url] = await Promise.all([api.duration(file.path), api.fileUrl(file.path)]);
  if (!(dur > 0)) { $('#trim-note').hidden = false; $('#trim-note').textContent = 'Dosyanın süresi okunamadı; bu dosya kesilemiyor.'; return; }
  trim.dur = dur; trim.start = 0; trim.end = dur;
  const m = h(file.kind === 'video' ? 'video' : 'audio', { src: url, preload: 'metadata' });
  if (file.kind === 'video') { m.muted = false; m.addEventListener('click', togglePlay); box.append(m); }
  else { box.append(h('img', { class: 'disc', src: '../assets/icon.png', alt: '' }), m); }
  m.addEventListener('timeupdate', onTime); m.addEventListener('ended', () => ($('#tl-toggle').textContent = 'Oynat (Boşluk)'));
  m.addEventListener('error', () => { $('#trim-note').hidden = false; $('#trim-note').textContent = 'Bu dosya burada önizlenemiyor, ama süreleri elle yazarak yine kesebilirsin.'; });
  trim.media = m;
  $('#t-save').disabled = false;
  drawTrim();
}
function drawTrim() {
  const d = trim.dur || 1, pc = (x) => (x / d * 100) + '%';
  $('#tl-start').style.left = pc(trim.start); $('#tl-end').style.left = pc(trim.end);
  const r = $('#tl-range'); r.style.left = pc(trim.start); r.style.width = ((trim.end - trim.start) / d * 100) + '%';
  $('#t-start').value = fmtT(trim.start); $('#t-end').value = fmtT(trim.end);
  $('#t-len').textContent = 'Kesit: ' + (trim.end - trim.start).toFixed(1) + ' sn';
  const cur = trim.media ? trim.media.currentTime : 0; $('#tl-play').style.left = pc(cur);
}
function onTime() {
  if (!trim.media) return;
  if (trim.media.currentTime >= trim.end) { trim.media.pause(); trim.media.currentTime = trim.start; $('#tl-toggle').textContent = 'Oynat (Boşluk)'; }
  drawTrim();
}
function togglePlay() {
  const m = trim.media; if (!m) return;
  if (m.paused) { if (m.currentTime < trim.start || m.currentTime >= trim.end) m.currentTime = trim.start; m.play(); $('#tl-toggle').textContent = 'Duraklat (Boşluk)'; }
  else { m.pause(); $('#tl-toggle').textContent = 'Oynat (Boşluk)'; }
}
function seek(t) { if (trim.media) trim.media.currentTime = Math.max(0, Math.min(trim.dur, t)); drawTrim(); }
function setStart(t) { trim.start = Math.max(0, Math.min(t, trim.end - 0.1)); drawTrim(); }
function setEnd(t) { trim.end = Math.min(trim.dur, Math.max(t, trim.start + 0.1)); drawTrim(); }
function timeAt(e) { const r = $('#timeline').getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * trim.dur; }
function dragHandle(el, apply) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation(); el.setPointerCapture(e.pointerId);
    const mv = (ev) => { const t = timeAt(ev); apply(t); seek(t); };
    const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up);
  });
}
dragHandle($('#tl-start'), setStart); dragHandle($('#tl-end'), setEnd);
$('#timeline').addEventListener('pointerdown', (e) => { if (trim.dur) seek(timeAt(e)); });
$('#tl-toggle').addEventListener('click', togglePlay);
$('#t-set-start').addEventListener('click', () => trim.media && setStart(trim.media.currentTime));
$('#t-set-end').addEventListener('click', () => trim.media && setEnd(trim.media.currentTime));
$('#t-start').addEventListener('change', (e) => { const v = parseT(e.target.value); if (v != null) setStart(v); else drawTrim(); });
$('#t-end').addEventListener('change', (e) => { const v = parseT(e.target.value); if (v != null) setEnd(v); else drawTrim(); });
$('#trim-back').addEventListener('click', () => { if (trim.media) trim.media.pause(); show('home'); });
$('#t-save').addEventListener('click', async () => {
  if (trim.media) trim.media.pause();
  const t = addTask('Kesit · ' + trim.file.name);
  t.finish(await api.trim({ jobId: t.id, input: trim.file.path, start: trim.start, end: trim.end, copy: $('#t-copy').checked }));
});

/* ---------- İndir ---------- */
let dlMode = 'video';
function segCtl(root, onPick) {
  $$('button', root).forEach((b) => b.addEventListener('click', () => { $$('button', root).forEach((x) => x.setAttribute('aria-checked', String(x === b))); onPick(b.dataset.v); }));
}
segCtl($('#dl-mode'), (v) => { dlMode = v; $('#dl-q-wrap').hidden = v === 'audio'; });
async function refreshTool() {
  const s = await api.tools.status();
  $('#tool-banner').hidden = !!s.installed;
  return s;
}
async function enterDownload() {
  state.settings = await api.settings.get();
  $('#dl-dir').textContent = 'Kaydedilecek yer: ' + state.settings.downloadDir;
  refreshTool();
  setTimeout(() => $('#dl-url').focus(), 50);
}
$('#tool-install').addEventListener('click', async () => {
  const t = addTask('İndirme aracı kuruluyor', 'tools');
  const r = await api.tools.install();
  if (r.error) t.fail(r.error); else { t.finish({ results: [{ out: '' }].slice(0, 0), }); t.update({ fraction: 1, status: 'Kuruldu' }); toast('İndirme aracı hazır'); }
  refreshTool();
});
$('#dl-paste').addEventListener('click', async () => { $('#dl-url').value = (await api.readClipboardText() || '').trim(); });
$('#dl-go').addEventListener('click', async () => {
  const url = $('#dl-url').value.trim();
  if (!/^https?:\/\/\S+$/i.test(url)) return toast('Önce geçerli bir bağlantı yapıştır');
  const t = addTask((dlMode === 'audio' ? 'Ses' : 'Video') + ' indiriliyor');
  const r = await api.download({ jobId: t.id, url, mode: dlMode, quality: $('#dl-q').value });
  t.finish(r);
  if (r.error && /kurulu değil/.test(r.error)) refreshTool();
});
document.addEventListener('paste', (e) => {
  if (isTyping()) return;
  const txt = (e.clipboardData && e.clipboardData.getData('text') || '').trim();
  if (/^https?:\/\/\S+$/i.test(txt)) { show('download'); setTimeout(() => ($('#dl-url').value = txt), 80); }
});

/* ---------- Kütüphane ---------- */
let libTimer;
async function loadLibrary() {
  const rows = await api.library.list($('#lib-q').value);
  const box = $('#lib-list'); box.replaceChildren();
  if (!Array.isArray(rows) || !rows.length) { box.append(h('div', { class: 'empty' }, $('#lib-q').value ? 'Eşleşen kayıt yok.' : 'Henüz kayıt yok. Bir dosyayı dönüştürdüğünde ya da indirdiğinde burada görünür.')); return; }
  rows.forEach((r) => {
    const meta = [r.title, fmtSize(r.size), fmtWhen(r.when)].filter(Boolean).join(' · ') + (r.exists ? '' : ' · dosya taşınmış ya da silinmiş');
    box.append(h('div', { class: 'lib-row' + (r.exists ? '' : ' gone') },
      h('div', { class: 'dot ' + (r.kind || '') }, KIND_TAG[r.kind] || '•'),
      h('div', { style: 'min-width:0' }, h('div', { class: 'nm', title: r.out }, r.name), h('div', { class: 'meta' }, meta)),
      h('div', { class: 'acts' },
        h('button', { class: 'ghost small', disabled: !r.exists, onclick: () => api.open(r.out) }, 'Aç'),
        h('button', { class: 'ghost small', disabled: !r.exists, onclick: () => api.reveal(r.out) }, 'Klasörde göster'),
        h('button', { class: 'ghost small', 'aria-label': 'Kayıttan kaldır', onclick: async () => { await api.library.remove(r.id); loadLibrary(); } }, '×'))));
  });
}
$('#lib-q').addEventListener('input', () => { clearTimeout(libTimer); libTimer = setTimeout(loadLibrary, 150); });
let clearArmed = false;
$('#lib-clear').addEventListener('click', async (e) => {
  if (!clearArmed) { clearArmed = true; e.target.textContent = 'Emin misin? Tekrar bas'; setTimeout(() => { clearArmed = false; e.target.textContent = 'Listeyi temizle'; }, 3000); return; }
  clearArmed = false; e.target.textContent = 'Listeyi temizle'; await api.library.clear(); loadLibrary(); toast('Liste temizlendi (dosyalara dokunulmadı)');
});

/* ---------- Ayarlar ---------- */
async function enterSettings() {
  const s = state.settings = await api.settings.get();
  $$('input[name=outmode]').forEach((r) => (r.checked = r.value === s.outputMode));
  $('#set-outdir').textContent = s.outputMode === 'folder' && s.outputDir ? '— ' + s.outputDir : '';
  $('#set-dldir').textContent = s.downloadDir;
  $$('#set-theme button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === s.theme)));
  const ts = await api.tools.status();
  $('#set-tool').textContent = ts.installed ? 'Kurulu · sürüm ' + (ts.version || '?') : 'Kurulu değil (İndir ekranından kurabilirsin)';
  $('#set-tool-update').disabled = !ts.installed;
  const info = await api.appInfo(); $('#set-about').textContent = 'Dilim ' + info.version + ' · Görseller, ses ve video için ffmpeg, indirmeler için yt-dlp kullanır.';
}
$$('input[name=outmode]').forEach((r) => r.addEventListener('change', async () => { if (r.value === 'folder' && !state.settings.outputDir) return $('#set-pick-out').click(); await api.settings.set({ outputMode: r.value }); enterSettings(); }));
$('#set-pick-out').addEventListener('click', async () => { const d = await api.pickFolder(); if (d) { await api.settings.set({ outputMode: 'folder', outputDir: d }); enterSettings(); } });
$('#set-pick-dl').addEventListener('click', async () => { const d = await api.pickFolder(); if (d) { await api.settings.set({ downloadDir: d }); enterSettings(); } });
segCtl($('#set-theme'), (v) => api.settings.set({ theme: v }));
$('#set-tool-update').addEventListener('click', async (e) => {
  e.target.disabled = true; e.target.textContent = 'Güncelleniyor…';
  const r = await api.tools.update(); toast(r.error ? r.error : 'Güncel · sürüm ' + r.version);
  e.target.textContent = 'Güncelle'; enterSettings();
});

/* ---------- Sürükle-bırak ve kısayollar ---------- */
let dragDepth = 0;
const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; $('#dropveil').hidden = false; document.body.classList.add('drag'); });
window.addEventListener('dragover', (e) => { e.preventDefault(); });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) { $('#dropveil').hidden = true; document.body.classList.remove('drag'); } });
window.addEventListener('drop', async (e) => {
  e.preventDefault(); dragDepth = 0; $('#dropveil').hidden = true; document.body.classList.remove('drag');
  const paths = Array.from(e.dataTransfer.files || []).map((f) => api.pathForFile(f)).filter(Boolean);
  if (!paths.length) return;
  const infos = await api.inspect(paths);
  if (infos.length < paths.length && !infos.length) return toast('Klasörler desteklenmiyor, dosyaları sürükle');
  addFiles(infos);
});
window.addEventListener('keydown', (e) => {
  const c = e.ctrlKey || e.metaKey;
  if (c && e.key === 'o') { e.preventDefault(); pickFiles(); }
  else if (c && e.key === '1') show('home'); else if (c && e.key === '2') show('library'); else if (c && e.key === '3') show('download'); else if (c && e.key === ',') show('settings');
  else if (c && e.key === 'f' && state.view === 'library') { e.preventDefault(); $('#lib-q').focus(); }
  else if (c && e.code === 'Space') { e.preventDefault(); if (state.view !== 'home') show('home'); const first = $('.seg.on'); if (first) first.focus(); else pickFiles(); }
  else if (state.view === 'trim' && !isTyping()) {
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'i' || e.key === 'I') $('#t-set-start').click();
    else if (e.key === 'o' || e.key === 'O') $('#t-set-end').click();
    else if (e.key === 'ArrowLeft') seek((trim.media ? trim.media.currentTime : 0) - (e.shiftKey ? 5 : 1));
    else if (e.key === 'ArrowRight') seek((trim.media ? trim.media.currentTime : 0) + (e.shiftKey ? 5 : 1));
    else if (e.key === 'Escape') $('#trim-back').click();
  }
});

/* ---------- Başlangıç ---------- */
show('home');
renderWheel(null, false);
api.settings.get().then((s) => (state.settings = s));
})();
