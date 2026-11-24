'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = (ch, ...a) => ipcRenderer.invoke(ch, ...a);

contextBridge.exposeInMainWorld('dilim', {
  pathForFile: (file) => webUtils.getPathForFile(file),
  inspect: (paths) => invoke('files:inspect', paths),
  actions: (kind, paths) => invoke('files:actions', kind, paths),
  pickFiles: () => invoke('dialog:files'),
  pickFolder: () => invoke('dialog:folder'),
  convert: (req) => invoke('job:convert', req),
  trim: (req) => invoke('job:trim', req),
  download: (req) => invoke('job:download', req),
  cancel: (jobId) => invoke('job:cancel', jobId),
  readFile: (p) => invoke('file:read', p),
  fileUrl: (p) => invoke('file:url', p),
  duration: (p) => invoke('file:duration', p),
  savePdfPages: (req) => invoke('pdf:save', req),
  library: {
    list: (q) => invoke('lib:list', q),
    remove: (id) => invoke('lib:remove', id),
    clear: () => invoke('lib:clear'),
  },
  open: (p) => invoke('shell:open', p),
  reveal: (p) => invoke('shell:reveal', p),
  settings: { get: () => invoke('settings:get'), set: (patch) => invoke('settings:set', patch) },
  tools: {
    status: () => invoke('tools:status'),
    install: () => invoke('tools:install'),
    update: () => invoke('tools:update'),
  },
  readClipboardText: () => invoke('clipboard:text'),
  appInfo: () => invoke('app:info'),
  onProgress: (cb) => {
    const h = (_e, msg) => cb(msg);
    ipcRenderer.on('job:progress', h);
    return () => ipcRenderer.removeListener('job:progress', h);
  },
  onOpenFiles: (cb) => {
    const h = (_e, paths) => cb(paths);
    ipcRenderer.on('open-files', h);
    return () => ipcRenderer.removeListener('open-files', h);
  },
});
