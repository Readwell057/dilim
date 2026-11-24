'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, nativeTheme, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const fm = require('./src/core/formats');
const jobs = require('./src/core/jobs');
const ff = require('./src/core/ffmpeg');
const ytdlp = require('./src/core/ytdlp');
const { Library } = require('./src/core/library');
const { uniquePath, baseName, sanitize } = require('./src/core/util');

if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null;
let library = null;
let settings = null;
const running = new Map(); // jobId -> AbortController

const userFile = (n) => path.join(app.getPath('userData'), n);
const toolsDir = () => path.join(app.getPath('userData'), 'tools');

function loadSettings() {
  const def = { outputMode: 'same', outputDir: '', theme: 'system', downloadDir: path.join(app.getPath('downloads'), 'Dilim') };
  try { return Object.assign(def, JSON.parse(fs.readFileSync(userFile('settings.json'), 'utf8'))); } catch (_) { return def; }
}
function saveSettings() {
  try { fs.writeFileSync(userFile('settings.json'), JSON.stringify(settings, null, 2)); } catch (_) {}
}

function send(msg) {
  if (win && !win.isDestroyed()) win.webContents.send('job:progress', msg);
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try { return await fn(...args); } catch (e) { return { error: e && e.message ? e.message : String(e) }; }
  });
}

function fileInfo(p) {
  const st = fs.statSync(p);
  if (!st.isFile()) return null;
  return { path: p, name: path.basename(p), ext: fm.extOf(p), kind: fm.kindOf(p), size: st.size };
}

function addToLibrary(entry) {
  library.add(entry);
}

function track(jobId) {
  const ac = new AbortController();
  running.set(jobId, ac);
  return ac;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1120, height: 740, minWidth: 920, minHeight: 640,
    title: 'Dilim',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1b1730' : '#f3f1fa',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.once('did-finish-load', () => {
    const paths = process.argv.slice(app.isPackaged ? 1 : 2).filter((a) => !a.startsWith('--') && fs.existsSync(a));
    if (paths.length) win.webContents.send('open-files', paths);
  });
}

app.on('second-instance', (_e, argv) => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
  const paths = argv.slice(app.isPackaged ? 1 : 2).filter((a) => !a.startsWith('--') && fs.existsSync(a));
  if (paths.length) win.webContents.send('open-files', paths);
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  library = new Library(userFile('library.json'));
  settings = loadSettings();
  nativeTheme.themeSource = settings.theme || 'system';
  createWindow();
});

app.on('window-all-closed', () => { running.forEach((ac) => ac.abort()); app.quit(); });

/* ---------- Dosya ve pencere ---------- */
handle('files:actions', (kind, paths) => fm.actionsFor(kind, paths));
handle('files:inspect', (paths) => (paths || []).map((p) => { try { return fileInfo(p); } catch (_) { return null; } }).filter(Boolean));

handle('dialog:files', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], title: 'Dosya seç' });
  if (r.canceled) return [];
  return r.filePaths.map(fileInfo).filter(Boolean);
});

handle('dialog:folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], title: 'Klasör seç' });
  return r.canceled ? null : r.filePaths[0];
});

handle('file:read', (p) => fs.readFileSync(p));
handle('file:url', (p) => pathToFileURL(p).href);
handle('file:duration', (p) => ff.probeDuration(p));
handle('shell:open', (p) => shell.openPath(p));
handle('shell:reveal', (p) => { try { if (fs.statSync(p).isDirectory()) return shell.openPath(p); } catch (_) {} shell.showItemInFolder(p); });
handle('clipboard:text', () => clipboard.readText());
handle('app:info', () => ({ version: app.getVersion(), platform: process.platform }));

/* ---------- Ayarlar ---------- */
handle('settings:get', () => settings);
handle('settings:set', (patch) => {
  settings = Object.assign(settings, patch);
  nativeTheme.themeSource = settings.theme || 'system';
  saveSettings();
  return settings;
});

/* ---------- Kütüphane ---------- */
handle('lib:list', (q) => library.list(q));
handle('lib:remove', (id) => { library.remove(id); return true; });
handle('lib:clear', () => { library.clear(); return true; });

/* ---------- İşler ---------- */
handle('job:cancel', (jobId) => { const ac = running.get(jobId); if (ac) ac.abort(); return true; });

handle('job:convert', async ({ jobId, kind, files, action, merge }) => {
  const ac = track(jobId);
  const results = [];
  const total = files.length;
  try {
    if (action.type === 'topdf') {
      const res = await jobs.imagesToPdf({
        inputs: files, merge, settings, signal: ac.signal,
        onProgress: (f) => send({ jobId, fraction: f, name: path.basename(files[0]), index: 0, total: 1 }),
      });
      for (const r of res) {
        const st = fs.statSync(r.out);
        addToLibrary({ name: path.basename(r.out), title: (r.inputs.length > 1 ? r.inputs.length + ' görsel' : fm.extOf(r.inputs[0]).toUpperCase()) + ' → PDF', kind: 'pdf', tool: 'convert', src: r.inputs[0], out: r.out, size: st.size });
        results.push({ out: r.out });
      }
      return { results };
    }
    for (let i = 0; i < total; i++) {
      const input = files[i];
      const name = path.basename(input);
      const onProgress = (f) => send({ jobId, fraction: (i + f) / total, name, index: i, total });
      send({ jobId, fraction: i / total, name, index: i, total });
      try {
        const r = action.type === 'extract'
          ? await jobs.extractAudio({ input, target: action.target, settings, signal: ac.signal, onProgress })
          : await jobs.convertFile({ input, kind, target: action.target, settings, signal: ac.signal, onProgress });
        if (r.skipped) { results.push({ input, skipped: r.reason }); continue; }
        const st = fs.statSync(r.out);
        addToLibrary({
          name: path.basename(r.out),
          title: action.type === 'extract' ? 'Ses çıkarıldı → ' + action.target.toUpperCase() : fm.extOf(input).toUpperCase() + ' → ' + action.target.toUpperCase(),
          kind: fm.kindOf(r.out), tool: 'convert', src: input, out: r.out, size: st.size,
        });
        results.push({ input, out: r.out });
      } catch (e) {
        if (e.cancelled) throw e;
        results.push({ input, error: e.message });
      }
    }
    return { results };
  } catch (e) {
    if (e.cancelled) return { cancelled: true, results };
    throw e;
  } finally {
    running.delete(jobId);
  }
});

handle('job:trim', async ({ jobId, input, start, end, copy }) => {
  const ac = track(jobId);
  try {
    const name = path.basename(input);
    const r = await jobs.trimFile({ input, start, end, copy, settings, signal: ac.signal, onProgress: (f) => send({ jobId, fraction: f, name, index: 0, total: 1 }) });
    const st = fs.statSync(r.out);
    addToLibrary({ name: path.basename(r.out), title: 'Kesit', kind: fm.kindOf(r.out), tool: 'trim', src: input, out: r.out, size: st.size });
    return { results: [{ input, out: r.out }] };
  } catch (e) {
    if (e.cancelled) return { cancelled: true, results: [] };
    throw e;
  } finally {
    running.delete(jobId);
  }
});

handle('job:download', async ({ jobId, url, mode, quality }) => {
  if (!ytdlp.isUrl(url)) throw new Error('Geçerli bir bağlantı gir (https://… ile başlamalı).');
  if (!ytdlp.isInstalled(toolsDir())) throw new Error('İndirme aracı kurulu değil. Önce “Aracı kur” düğmesine bas.');
  const ac = track(jobId);
  try {
    const outDir = settings.downloadDir;
    send({ jobId, fraction: 0, name: url, index: 0, total: 1, status: 'Bağlanıyor…' });
    const r = await ytdlp.download({
      toolsDir: toolsDir(), ffmpegPath: ff.getFfmpegPath(), url, mode, quality, outDir, signal: ac.signal,
      onProgress: (f) => send({ jobId, fraction: mode === 'audio' ? f * 0.9 : f, name: url, index: 0, total: 1, status: 'İndiriliyor…' }),
      onStatus: (s) => send({ jobId, fraction: null, name: url, index: 0, total: 1, status: s }),
    });
    let finalFile = r.file;
    if (r.needsAudioConvert) {
      send({ jobId, fraction: 0.92, name: path.basename(r.file), index: 0, total: 1, status: 'MP3’e çevriliyor…' });
      const out = uniquePath(outDir, baseName(r.file), 'mp3');
      await ff.runFfmpeg(ff.buildExtractArgs('mp3', r.file, out), { signal: ac.signal });
      try { fs.unlinkSync(r.file); } catch (_) {}
      finalFile = out;
    }
    const st = fs.statSync(finalFile);
    addToLibrary({ name: path.basename(finalFile), title: 'İndirildi · ' + (mode === 'audio' ? 'MP3' : 'MP4'), kind: fm.kindOf(finalFile), tool: 'download', src: url, out: finalFile, size: st.size });
    return { results: [{ input: url, out: finalFile }] };
  } catch (e) {
    if (e.cancelled) return { cancelled: true, results: [] };
    throw e;
  } finally {
    running.delete(jobId);
  }
});

/* ---------- PDF → görsel (çizimi arayüz yapar, kaydı burası) ---------- */
handle('pdf:save', ({ src, ext, page, pages, data, folder, finish }) => {
  if (finish) {
    addToLibrary({ name: path.basename(folder), title: 'PDF → ' + ext.toUpperCase() + ' · ' + pages + ' sayfa', kind: 'image', tool: 'convert', src, out: folder, size: 0 });
    return { ok: true };
  }
  let dir = folder;
  if (!dir) {
    dir = uniquePath(jobs.outFolder(src, settings), sanitize(baseName(src)) + ' sayfaları', '');
    fs.mkdirSync(dir, { recursive: true });
  }
  const pad = String(pages).length;
  const file = path.join(dir, sanitize(baseName(src)) + '-' + String(page).padStart(Math.max(2, pad), '0') + '.' + ext);
  fs.writeFileSync(file, Buffer.from(data));
  return { folder: dir, file };
});

/* ---------- İndirme aracı ---------- */
handle('tools:status', async () => ({ installed: ytdlp.isInstalled(toolsDir()), version: await ytdlp.version(toolsDir()) }));
handle('tools:install', async () => {
  await ytdlp.install(toolsDir(), (f) => send({ jobId: 'tools', fraction: f, name: 'İndirme aracı', index: 0, total: 1 }));
  return { installed: true, version: await ytdlp.version(toolsDir()) };
});
handle('tools:update', async () => ({ installed: true, version: await ytdlp.update(toolsDir()) }));
