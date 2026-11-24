'use strict';
const fs = require('fs');
const path = require('path');

class Library {
  constructor(file) {
    this.file = file;
    this.items = [];
    this._load();
  }
  _load() {
    try {
      const j = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (Array.isArray(j)) this.items = j;
    } catch (_) { this.items = []; }
  }
  _save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.items), 'utf8');
      fs.renameSync(tmp, this.file);
    } catch (_) { /* kütüphane yazılamazsa uygulama çalışmaya devam eder */ }
  }
  add(entry) {
    const e = Object.assign({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), when: Date.now() }, entry);
    this.items.unshift(e);
    if (this.items.length > 2000) this.items.length = 2000;
    this._save();
    return e;
  }
  list(query) {
    const q = String(query || '').trim().toLocaleLowerCase('tr');
    const rows = this.items.map((e) => Object.assign({ exists: !!e.out && fs.existsSync(e.out) }, e));
    if (!q) return rows;
    return rows.filter((e) => (e.name + ' ' + e.title + ' ' + (e.out || '')).toLocaleLowerCase('tr').includes(q));
  }
  remove(id) {
    this.items = this.items.filter((e) => e.id !== id);
    this._save();
  }
  clear() {
    this.items = [];
    this._save();
  }
}

module.exports = { Library };
