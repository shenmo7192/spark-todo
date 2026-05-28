const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const SHEETS = {
  meta: 'meta',
  categories: 'categories',
  tasks: 'tasks',
  stages: 'stages',
  routine_records: 'routine_records'
};

const HEADERS = {
  meta: ['key', 'value'],
  categories: ['id', 'name', 'is_routine', 'sort_order', 'created_at'],
  tasks: ['id', 'category_id', 'title', 'description', 'status', 'progress', 'is_routine', 'created_at', 'started_at', 'completed_at'],
  stages: ['id', 'task_id', 'stage_index', 'note', 'progress_value', 'created_at', 'updated_at'],
  routine_records: ['id', 'task_id', 'year_month', 'quantity', 'filled_at']
};

class ExcelDB {
  constructor(filePath) {
    this.filePath = filePath;
    this.workbook = null;
    this.init();
  }

  init() {
    if (fs.existsSync(this.filePath)) {
      this.workbook = xlsx.readFile(this.filePath, { cellDates: true });
    } else {
      this.workbook = xlsx.utils.book_new();
      for (const name of Object.values(SHEETS)) {
        const ws = xlsx.utils.aoa_to_sheet([HEADERS[name]]);
        xlsx.utils.book_append_sheet(this.workbook, ws, name);
      }
      // Seed default categories
      this._appendRows(SHEETS.categories, [
        [1, '日常工作', 1, 0, new Date().toISOString()],
        [2, '其他工作', 0, 1, new Date().toISOString()]
      ]);
      this._setMeta('last_category_id', 2);
      this._setMeta('last_task_id', 0);
      this._setMeta('last_stage_id', 0);
      this._setMeta('last_routine_id', 0);
      this.save();
    }
  }

  save() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    xlsx.writeFile(this.workbook, this.filePath);
  }

  _getSheet(name) {
    return this.workbook.Sheets[name];
  }

  _sheetToJson(name) {
    const ws = this._getSheet(name);
    if (!ws) return [];
    return xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' }).slice(1);
  }

  _appendRows(sheetName, rows) {
    const ws = this._getSheet(sheetName);
    const existing = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const newData = [...existing, ...rows];
    const newWs = xlsx.utils.aoa_to_sheet(newData);
    this.workbook.Sheets[sheetName] = newWs;
  }

  _replaceSheet(sheetName, rows) {
    const newWs = xlsx.utils.aoa_to_sheet([HEADERS[sheetName], ...rows]);
    this.workbook.Sheets[sheetName] = newWs;
  }

  _getMeta(key) {
    const rows = this._sheetToJson(SHEETS.meta);
    const row = rows.find(r => r[0] === key);
    return row ? row[1] : undefined;
  }

  _setMeta(key, value) {
    const rows = this._sheetToJson(SHEETS.meta);
    const idx = rows.findIndex(r => r[0] === key);
    if (idx >= 0) rows[idx][1] = value;
    else rows.push([key, value]);
    this._replaceSheet(SHEETS.meta, rows);
  }

  _nextId(type) {
    const key = `last_${type}_id`;
    let id = parseInt(this._getMeta(key) || '0', 10);
    id += 1;
    this._setMeta(key, id);
    return id;
  }

  // Categories
  getCategories() {
    return this._sheetToJson(SHEETS.categories).map(r => ({
      id: r[0], name: r[1], is_routine: r[2], sort_order: r[3], created_at: r[4]
    }));
  }

  addCategory(name, isRoutine) {
    const cats = this.getCategories();
    const maxOrder = cats.length ? Math.max(...cats.map(c => c.sort_order)) : -1;
    const id = this._nextId('category');
    this._appendRows(SHEETS.categories, [[id, name, isRoutine ? 1 : 0, maxOrder + 1, new Date().toISOString()]]);
    this.save();
    return id;
  }

  deleteCategory(id) {
    const cats = this.getCategories().filter(c => c.id !== id);
    this._replaceSheet(SHEETS.categories, cats.map(c => [c.id, c.name, c.is_routine, c.sort_order, c.created_at]));
    this.save();
  }

  getTaskById(taskId) {
    const allTasks = this._sheetToJson(SHEETS.tasks).map(r => ({
      id: r[0], category_id: r[1], title: r[2], description: r[3], status: r[4],
      progress: r[5], is_routine: r[6], created_at: r[7], started_at: r[8], completed_at: r[9]
    }));
    const task = allTasks.find(t => t.id == taskId);
    if (!task) return null;
    if (task.is_routine) {
      task.routineRecord = null;
    } else {
      task.stages = this._sheetToJson(SHEETS.stages)
        .filter(r => r[1] == task.id)
        .map(r => ({ id: r[0], task_id: r[1], stage_index: r[2], note: r[3], progress_value: r[4], created_at: r[5], updated_at: r[6] }))
        .sort((a, b) => a.stage_index - b.stage_index);
    }
    return task;
  }

  getTasks(categoryId, yearMonth) {
    const allTasks = this._sheetToJson(SHEETS.tasks).map(r => ({
      id: r[0], category_id: r[1], title: r[2], description: r[3], status: r[4],
      progress: r[5], is_routine: r[6], created_at: r[7], started_at: r[8], completed_at: r[9]
    }));
    const tasks = allTasks.filter(t => t.category_id == categoryId);
    for (const task of tasks) {
      if (task.is_routine) {
        const recs = this._sheetToJson(SHEETS.routine_records)
          .filter(r => r[1] == task.id && r[2] === yearMonth)
          .map(r => ({ id: r[0], task_id: r[1], year_month: r[2], quantity: r[3], filled_at: r[4] }));
        task.routineRecord = recs[0] || null;
      } else {
        const stages = this._sheetToJson(SHEETS.stages)
          .filter(r => r[1] == task.id)
          .map(r => ({ id: r[0], task_id: r[1], stage_index: r[2], note: r[3], progress_value: r[4], created_at: r[5], updated_at: r[6] }))
          .sort((a, b) => a.stage_index - b.stage_index);
        task.stages = stages;
      }
    }
    return tasks;
  }

  addTask(task) {
    const id = this._nextId('task');
    const now = new Date().toISOString();
    this._appendRows(SHEETS.tasks, [[
      id, task.categoryId, task.title, task.description || '', task.status || 'created',
      task.progress || 0, task.isRoutine ? 1 : 0, now, '', ''
    ]]);
    this.save();
    return id;
  }

  updateTask(task) {
    const rows = this._sheetToJson(SHEETS.tasks);
    const idx = rows.findIndex(r => r[0] == task.id);
    if (idx < 0) return;
    const existing = rows[idx];
    const oldStatus = existing[4];
    const now = new Date().toISOString();
    let started = existing[8];
    let completed = existing[9];
    let progress = parseInt(existing[5]) || 0;

    if (task.status === 'in_progress' && oldStatus === 'created' && !started) {
      started = now;
    }
    if (task.status === 'completed' && oldStatus !== 'completed') {
      completed = now;
      progress = 100;
      const stages = this._sheetToJson(SHEETS.stages)
        .filter(r => r[1] == task.id)
        .sort((a, b) => a[2] - b[2]);
      if (stages.length > 0) {
        const perStage = Math.floor(100 / stages.length);
        const remainder = 100 - perStage * stages.length;
        const stageRows = this._sheetToJson(SHEETS.stages);
        stages.forEach((s, i) => {
          const sIdx = stageRows.findIndex(sr => sr[0] == s[0]);
          if (sIdx >= 0) {
            stageRows[sIdx][4] = perStage + (i === stages.length - 1 ? remainder : 0);
            stageRows[sIdx][6] = now;
          }
        });
        this._replaceSheet(SHEETS.stages, stageRows);
      }
    }

    rows[idx] = [task.id, existing[1], task.title, task.description || '', task.status, progress, existing[6], existing[7], started, completed];
    this._replaceSheet(SHEETS.tasks, rows);
    this.save();
  }

  deleteTask(id) {
    const tasks = this._sheetToJson(SHEETS.tasks).filter(r => r[0] != id);
    this._replaceSheet(SHEETS.tasks, tasks);
    const stages = this._sheetToJson(SHEETS.stages).filter(r => r[1] != id);
    this._replaceSheet(SHEETS.stages, stages);
    const routines = this._sheetToJson(SHEETS.routine_records).filter(r => r[1] != id);
    this._replaceSheet(SHEETS.routine_records, routines);
    this.save();
  }

  // Stages
  getStages(taskId) {
    return this._sheetToJson(SHEETS.stages)
      .filter(r => r[1] == taskId)
      .map(r => ({ id: r[0], task_id: r[1], stage_index: r[2], note: r[3], progress_value: r[4], created_at: r[5], updated_at: r[6] }))
      .sort((a, b) => b.stage_index - a.stage_index);
  }

  addStage(stage) {
    const all = this._sheetToJson(SHEETS.stages).filter(r => r[1] == stage.taskId);
    const maxIndex = all.length ? Math.max(...all.map(s => s[2])) : 0;
    const nextIndex = maxIndex + 1;
    const id = this._nextId('stage');
    const now = new Date().toISOString();

    const totalStages = all.length + 1;
    const perStage = Math.floor(100 / totalStages);
    const remainder = 100 - perStage * totalStages;

    const stageRows = this._sheetToJson(SHEETS.stages);
    all.forEach((s, i) => {
      const sIdx = stageRows.findIndex(sr => sr[0] == s[0]);
      if (sIdx >= 0) {
        stageRows[sIdx][4] = perStage + (i === all.length - 1 && remainder > 0 ? remainder : 0);
        stageRows[sIdx][6] = now;
      }
    });

    const newProgress = perStage + (totalStages === 1 ? remainder : 0);
    stageRows.push([id, stage.taskId, nextIndex, stage.note || '', newProgress, now, now]);
    this._replaceSheet(SHEETS.stages, stageRows);

    const taskRows = this._sheetToJson(SHEETS.tasks);
    const tIdx = taskRows.findIndex(r => r[0] == stage.taskId);
    if (tIdx >= 0) {
      if (taskRows[tIdx][4] === 'created') {
        taskRows[tIdx][4] = 'in_progress';
        taskRows[tIdx][8] = now;
      }
      taskRows[tIdx][5] = newProgress;
      this._replaceSheet(SHEETS.tasks, taskRows);
    }
    this.save();
    return id;
  }

  updateStage(stage) {
    const rows = this._sheetToJson(SHEETS.stages);
    const idx = rows.findIndex(r => r[0] == stage.id);
    if (idx >= 0) {
      rows[idx][3] = stage.note || '';
      rows[idx][4] = stage.progressValue || 0;
      rows[idx][6] = new Date().toISOString();
      this._replaceSheet(SHEETS.stages, rows);
      this.save();
    }
  }

  // Routine
  getRoutineRecord(taskId, yearMonth) {
    const recs = this._sheetToJson(SHEETS.routine_records)
      .filter(r => r[1] == taskId && r[2] === yearMonth)
      .map(r => ({ id: r[0], task_id: r[1], year_month: r[2], quantity: r[3], filled_at: r[4] }));
    return recs[0] || null;
  }

  fillRoutine(record) {
    const rows = this._sheetToJson(SHEETS.routine_records);
    const idx = rows.findIndex(r => r[1] == record.taskId && r[2] === record.yearMonth);
    const now = new Date().toISOString();
    if (idx >= 0) {
      rows[idx][3] = record.quantity;
      rows[idx][4] = now;
    } else {
      const id = this._nextId('routine');
      rows.push([id, record.taskId, record.yearMonth, record.quantity, now]);
    }
    this._replaceSheet(SHEETS.routine_records, rows);
    this.save();
  }

  getLastMonthRoutine(taskId, yearMonth) {
    const [y, m] = yearMonth.split('-').map(Number);
    const lastM = m === 1 ? 12 : m - 1;
    const lastY = m === 1 ? y - 1 : y;
    const lastYm = `${lastY}-${String(lastM).padStart(2, '0')}`;
    const recs = this._sheetToJson(SHEETS.routine_records)
      .filter(r => r[1] == taskId && r[2] === lastYm)
      .map(r => ({ id: r[0], task_id: r[1], year_month: r[2], quantity: r[3], filled_at: r[4] }));
    return recs[0] || null;
  }

  getAllActiveMonths() {
    const months = new Set();
    this._sheetToJson(SHEETS.stages).forEach(r => {
      if (r[5]) months.add(r[5].substring(0, 7));
      if (r[6]) months.add(r[6].substring(0, 7));
    });
    this._sheetToJson(SHEETS.tasks).forEach(r => {
      if (r[9]) months.add(r[9].substring(0, 7));
    });
    this._sheetToJson(SHEETS.routine_records).forEach(r => {
      if (r[2]) months.add(r[2]);
    });
    return Array.from(months).filter(Boolean).sort();
  }

  getExportData() {
    const tasks = this._sheetToJson(SHEETS.tasks).map(r => ({
      id: r[0], category_id: r[1], title: r[2], description: r[3], status: r[4],
      progress: r[5], is_routine: r[6], created_at: r[7], started_at: r[8], completed_at: r[9]
    }));
    const cats = this.getCategories();
    for (const task of tasks) {
      task.category = cats.find(c => c.id == task.category_id);
      if (task.is_routine) {
        task.records = this._sheetToJson(SHEETS.routine_records)
          .filter(r => r[1] == task.id)
          .map(r => ({ id: r[0], task_id: r[1], year_month: r[2], quantity: r[3], filled_at: r[4] }))
          .sort((a, b) => a.year_month.localeCompare(b.year_month));
      } else {
        task.stages = this._sheetToJson(SHEETS.stages)
          .filter(r => r[1] == task.id)
          .map(r => ({ id: r[0], task_id: r[1], stage_index: r[2], note: r[3], progress_value: r[4], created_at: r[5], updated_at: r[6] }))
          .sort((a, b) => a.stage_index - b.stage_index);
      }
    }
    return tasks;
  }

  getRoutineTasksByCategory(categoryId) {
    return this._sheetToJson(SHEETS.tasks)
      .filter(r => r[1] == categoryId && r[6] == 1)
      .map(r => ({
        id: r[0], category_id: r[1], title: r[2], description: r[3], status: r[4],
        progress: r[5], is_routine: r[6], created_at: r[7], started_at: r[8], completed_at: r[9]
      }));
  }

  checkRoutineUnfilled(categoryId, yearMonth) {
    const routineTasks = this.getRoutineTasksByCategory(categoryId);
    const [y, m] = yearMonth.split('-').map(Number);
    const lastM = m === 1 ? 12 : m - 1;
    const lastY = m === 1 ? y - 1 : y;
    const lastYm = `${lastY}-${String(lastM).padStart(2, '0')}`;

    const unfilled = [];
    for (const task of routineTasks) {
      const lastRec = this.getRoutineRecord(task.id, lastYm);
      const curRec = this.getRoutineRecord(task.id, yearMonth);
      if (!lastRec) {
        unfilled.push({ task, lastYm, isPriorMonth: true });
      }
      if (!curRec) {
        const already = unfilled.find(u => u.task.id === task.id);
        if (!already) {
          unfilled.push({ task, yearMonth, isPriorMonth: false });
        }
      }
    }
    return unfilled;
  }
}

module.exports = ExcelDB;
