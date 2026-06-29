// Core: SHEETS, HEADERS, init, save, low-level ops, migrations

const xlsx = require('xlsx-js-style');
const fs = require('fs');
const path = require('path');

const SHEETS = {
  meta: 'meta',
  topics: 'topics',
  categories: 'categories',
  tasks: 'tasks',
  stages: 'stages',
  routine_records: 'routine_records',
  carry_overs: 'carry_overs'
};

const HEADERS = {
  meta: ['key', 'value'],
  topics: ['id', 'name', 'sort_order', 'created_at'],
  categories: ['id', 'name', 'is_routine', 'sort_order', 'created_at', 'topic_id', 'ended_at'],
  tasks: ['id', 'category_id', 'title', 'description', 'status', 'progress', 'is_routine', 'created_at', 'started_at', 'completed_at', 'sort_order', 'importance', 'manual_duration', 'contact_person'],
  stages: ['id', 'task_id', 'stage_index', 'note', 'progress_value', 'created_at', 'updated_at', 'is_completed'],
  routine_records: ['id', 'task_id', 'year_month', 'quantity', 'filled_at'],
  carry_overs: ['task_id', 'year_month', 'carried_at']
};

module.exports = {
  SHEETS,
  HEADERS,

  init: function() {
    if (fs.existsSync(this.filePath)) {
      const buffer = fs.readFileSync(this.filePath);
      this.workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true });
      for (const name of Object.values(SHEETS)) {
        if (!this.workbook.Sheets[name]) {
          const ws = xlsx.utils.aoa_to_sheet([HEADERS[name]]);
          xlsx.utils.book_append_sheet(this.workbook, ws, name);
        }
      }
      this._migrateTaskSortOrder();
      this._migrateStageCompleted();
      this._migrateTopics();
      this._migrateTaskFields();
      this._migrateCategoryEndedAt();
    } else {
      this.workbook = xlsx.utils.book_new();
      for (const name of Object.values(SHEETS)) {
        const ws = xlsx.utils.aoa_to_sheet([HEADERS[name]]);
        xlsx.utils.book_append_sheet(this.workbook, ws, name);
      }
      this._appendRows(SHEETS.topics, [
        [1, '专项任务', 0, new Date().toISOString()],
        [2, '临时任务', 1, new Date().toISOString()],
        [3, '日常工作', 2, new Date().toISOString()]
      ]);
      this._setMeta('last_topic_id', 3);
      this._appendRows(SHEETS.categories, [
        [1, '工作任务', 0, 0, new Date().toISOString(), 1, ''],
        [2, '日常工作', 1, 1, new Date().toISOString(), 3, '']
      ]);
      this._setMeta('last_category_id', 2);
      this._setMeta('last_task_id', 0);
      this._setMeta('last_stage_id', 0);
      this._setMeta('last_routine_id', 0);
      this.save();
    }
  },

  save: function() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const buffer = xlsx.write(this.workbook, { type: 'buffer', bookType: 'xlsx' });
    fs.writeFileSync(this.filePath, buffer);
  },

  _getSheet: function(name) {
    return this.workbook.Sheets[name];
  },

  _sheetToJson: function(name) {
    const ws = this._getSheet(name);
    if (!ws) return [];
    return xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' }).slice(1);
  },

  _appendRows: function(sheetName, rows) {
    const ws = this._getSheet(sheetName);
    const existing = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const newData = [...existing, ...rows];
    const newWs = xlsx.utils.aoa_to_sheet(newData);
    this.workbook.Sheets[sheetName] = newWs;
  },

  _replaceSheet: function(sheetName, rows) {
    const newWs = xlsx.utils.aoa_to_sheet([HEADERS[sheetName], ...rows]);
    this.workbook.Sheets[sheetName] = newWs;
  },

  _getMeta: function(key) {
    const rows = this._sheetToJson(SHEETS.meta);
    const row = rows.find(function(r) { return r[0] === key; });
    return row ? row[1] : undefined;
  },

  _setMeta: function(key, value) {
    const rows = this._sheetToJson(SHEETS.meta);
    const idx = rows.findIndex(function(r) { return r[0] === key; });
    if (idx >= 0) rows[idx][1] = value;
    else rows.push([key, value]);
    this._replaceSheet(SHEETS.meta, rows);
  },

  getSetting: function(key) {
    return this._getMeta(key);
  },

  setSetting: function(key, value) {
    this._setMeta(key, value);
    this.save();
  },

  _nextId: function(type) {
    const key = 'last_' + type + '_id';
    let id = parseInt(this._getMeta(key) || '0', 10);
    id += 1;
    this._setMeta(key, id);
    return id;
  },

  // ---------- Migrations ----------

  _migrateTopics: function() {
    const ws = this._getSheet(SHEETS.categories);
    if (!ws) return;
    const catData = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (catData.length < 2) return;
    const catHeaderLen = catData[0].length;
    if (catHeaderLen >= HEADERS.categories.length) return;

    const topicsWs = this._getSheet(SHEETS.topics);
    const topicsData = topicsWs
      ? xlsx.utils.sheet_to_json(topicsWs, { header: 1, defval: '' })
      : [];

    let firstTopicId;
    if (topicsData.length < 2) {
      const now = new Date().toISOString();
      const defaultTopics = [
        [1, '专项任务', 0, now],
        [2, '临时任务', 1, now],
        [3, '日常工作', 2, now]
      ];
      this._replaceSheet(SHEETS.topics, defaultTopics);
      this._setMeta('last_topic_id', 3);
      firstTopicId = 1;
    } else {
      firstTopicId = parseInt(topicsData[1][0]) || 1;
    }

    const patchedCats = [];
    for (let i = 0; i < catData.length; i++) {
      const row = [...catData[i]];
      while (row.length < HEADERS.categories.length) row.push('');
      if (i > 0) row[5] = firstTopicId;
      patchedCats.push(row);
    }
    const newWs = xlsx.utils.aoa_to_sheet(patchedCats);
    this.workbook.Sheets[SHEETS.categories] = newWs;
    this.save();
  },

  _migrateTaskFields: function() {
    const ws = this._getSheet(SHEETS.tasks);
    if (!ws) return;
    const data = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (data.length < 2) return;
    const headerLen = data[0].length;
    if (headerLen >= HEADERS.tasks.length) return;

    const patched = [];
    for (let i = 0; i < data.length; i++) {
      const row = [...data[i]];
      while (row.length < HEADERS.tasks.length) row.push('');
      if (i > 0) {
        row[11] = 1;
        row[12] = '';
        row[13] = '';
      }
      patched.push(row);
    }
    const newWs = xlsx.utils.aoa_to_sheet(patched);
    this.workbook.Sheets[SHEETS.tasks] = newWs;
    this.save();
  },

  _migrateTaskSortOrder: function() {
    const ws = this._getSheet(SHEETS.tasks);
    if (!ws) return;
    const data = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (data.length < 2) return;
    const headerRow = data[0];
    if (headerRow.length >= HEADERS.tasks.length) return;

    const tasksByCategory = {};
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const catId = row[1];
      if (!tasksByCategory[catId]) tasksByCategory[catId] = [];
      tasksByCategory[catId].push(row);
    }

    for (const catId of Object.keys(tasksByCategory)) {
      const rows = tasksByCategory[catId];
      rows.sort(function(a, b) {
        var aDone = a[4] === 'completed' ? 1 : 0;
        var bDone = b[4] === 'completed' ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;
        return (b[7] || '').localeCompare(a[7] || '');
      });
      rows.forEach(function(row, idx) {
        while (row.length < HEADERS.tasks.length) row.push('');
        row[10] = idx + 1;
      });
    }

    const allRows = [HEADERS.tasks];
    for (const rows of Object.values(tasksByCategory)) {
      for (var ri = 0; ri < rows.length; ri++) allRows.push(rows[ri]);
    }
    const newWs = xlsx.utils.aoa_to_sheet(allRows);
    this.workbook.Sheets[SHEETS.tasks] = newWs;
    this.save();
  },

  _migrateCategoryEndedAt: function() {
    const ws = this._getSheet(SHEETS.categories);
    if (!ws) return;
    const data = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (data.length < 1) return;
    const headerRow = data[0];
    if (headerRow.length >= HEADERS.categories.length) return;

    const patched = [];
    for (let i = 0; i < data.length; i++) {
      const row = [...data[i]];
      while (row.length < HEADERS.categories.length) row.push('');
      patched.push(row);
    }
    const newWs = xlsx.utils.aoa_to_sheet(patched);
    this.workbook.Sheets[SHEETS.categories] = newWs;
    this.save();
  },

  _migrateStageCompleted: function() {
    const ws = this._getSheet(SHEETS.stages);
    if (!ws) return;
    const data = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (data.length < 2) return;
    const headerRow = data[0];
    if (headerRow.length >= HEADERS.stages.length) return;

    for (let i = 1; i < data.length; i++) {
      while (data[i].length < HEADERS.stages.length) data[i].push('');
      data[i][7] = data[i][3] && String(data[i][3]).trim() !== '' ? 1 : 0;
    }

    const newWs = xlsx.utils.aoa_to_sheet([HEADERS.stages, ...data.slice(1)]);
    this.workbook.Sheets[SHEETS.stages] = newWs;
    this.save();
  }
};
