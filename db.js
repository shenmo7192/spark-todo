const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const SHEETS = {
  meta: 'meta',
  categories: 'categories',
  tasks: 'tasks',
  stages: 'stages',
  routine_records: 'routine_records',
  carry_overs: 'carry_overs'
};

const HEADERS = {
  meta: ['key', 'value'],
  categories: ['id', 'name', 'is_routine', 'sort_order', 'created_at'],
  tasks: ['id', 'category_id', 'title', 'description', 'status', 'progress', 'is_routine', 'created_at', 'started_at', 'completed_at'],
  stages: ['id', 'task_id', 'stage_index', 'note', 'progress_value', 'created_at', 'updated_at'],
  routine_records: ['id', 'task_id', 'year_month', 'quantity', 'filled_at'],
  carry_overs: ['task_id', 'year_month', 'carried_at']
};

class ExcelDB {
  constructor(filePath) {
    this.filePath = filePath;
    this.workbook = null;
    this.init();
  }

  init() {
    if (fs.existsSync(this.filePath)) {
      const buffer = fs.readFileSync(this.filePath);
      this.workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true });
      // Ensure all sheets exist (backward compatibility)
      for (const name of Object.values(SHEETS)) {
        if (!this.workbook.Sheets[name]) {
          const ws = xlsx.utils.aoa_to_sheet([HEADERS[name]]);
          xlsx.utils.book_append_sheet(this.workbook, ws, name);
        }
      }
    } else {
      this.workbook = xlsx.utils.book_new();
      for (const name of Object.values(SHEETS)) {
        const ws = xlsx.utils.aoa_to_sheet([HEADERS[name]]);
        xlsx.utils.book_append_sheet(this.workbook, ws, name);
      }
      // Seed default categories
      this._appendRows(SHEETS.categories, [
        [1, '工作任务', 0, 0, new Date().toISOString()],
        [2, '日常工作', 1, 1, new Date().toISOString()]
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
    const buffer = xlsx.write(this.workbook, { type: 'buffer', bookType: 'xlsx' });
    fs.writeFileSync(this.filePath, buffer);
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
    })).sort((a, b) => a.sort_order - b.sort_order);
  }

  addCategory(name, isRoutine) {
    const cats = this.getCategories();
    const maxOrder = cats.length ? Math.max(...cats.map(c => c.sort_order)) : -1;
    const id = this._nextId('category');
    this._appendRows(SHEETS.categories, [[id, name, isRoutine ? 1 : 0, maxOrder + 1, new Date().toISOString()]]);
    this.save();
    return id;
  }

  updateCategory(id, name, isRoutine) {
    const cats = this.getCategories();
    const idx = cats.findIndex(c => c.id === id);
    if (idx < 0) return false;
    cats[idx].name = name;
    if (isRoutine !== undefined) cats[idx].is_routine = isRoutine ? 1 : 0;
    this._replaceSheet(SHEETS.categories, cats.map(c => [c.id, c.name, c.is_routine, c.sort_order, c.created_at]));
    this.save();
    return true;
  }

  moveCategory(id, direction) {
    const cats = this.getCategories();
    const idx = cats.findIndex(c => c.id === id);
    if (idx < 0) return false;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= cats.length) return false;
    const tmp = cats[idx].sort_order;
    cats[idx].sort_order = cats[targetIdx].sort_order;
    cats[targetIdx].sort_order = tmp;
    this._replaceSheet(SHEETS.categories, cats.map(c => [c.id, c.name, c.is_routine, c.sort_order, c.created_at]));
    this.save();
    return true;
  }

  deleteCategory(id) {
    const taskIds = this._sheetToJson(SHEETS.tasks)
      .filter(r => r[1] == id)
      .map(r => r[0]);

    const routines = this._sheetToJson(SHEETS.routine_records).filter(r => !taskIds.includes(r[1]));
    this._replaceSheet(SHEETS.routine_records, routines);

    const stages = this._sheetToJson(SHEETS.stages).filter(r => !taskIds.includes(r[1]));
    this._replaceSheet(SHEETS.stages, stages);

    const carries = this._sheetToJson(SHEETS.carry_overs).filter(r => !taskIds.includes(r[0]));
    this._replaceSheet(SHEETS.carry_overs, carries);

    const tasks = this._sheetToJson(SHEETS.tasks).filter(r => r[1] != id);
    this._replaceSheet(SHEETS.tasks, tasks);

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
    const carried = this.getCarriedTasks(categoryId, yearMonth);
    const result = [];

    for (const task of tasks) {
      if (task.is_routine) {
        if (yearMonth) {
          const createdYm = task.created_at ? task.created_at.substring(0, 7) : '';
          if (createdYm && createdYm > yearMonth) continue;
          const completedYm = task.completed_at ? task.completed_at.substring(0, 7) : '';
          if (completedYm && completedYm < yearMonth) continue;
        }
        const recs = this._sheetToJson(SHEETS.routine_records)
          .filter(r => r[1] == task.id && r[2] === yearMonth)
          .map(r => ({ id: r[0], task_id: r[1], year_month: r[2], quantity: r[3], filled_at: r[4] }));
        task.routineRecord = recs[0] || null;
        result.push(task);
      } else {
        const stages = this._sheetToJson(SHEETS.stages)
          .filter(r => r[1] == task.id)
          .map(r => ({ id: r[0], task_id: r[1], stage_index: r[2], note: r[3], progress_value: r[4], created_at: r[5], updated_at: r[6] }))
          .sort((a, b) => a.stage_index - b.stage_index);

        if (yearMonth) {
          const createdYm = task.created_at ? task.created_at.substring(0, 7) : '';
          if (createdYm && createdYm > yearMonth) continue;
          const completedYm = task.completed_at ? task.completed_at.substring(0, 7) : '';
          if (completedYm && completedYm < yearMonth) continue;
        }

        const taskMonths = new Set();
        if (task.created_at) taskMonths.add(task.created_at.substring(0, 7));
        if (task.completed_at) taskMonths.add(task.completed_at.substring(0, 7));
        for (const s of stages) {
          if (s.created_at) taskMonths.add(s.created_at.substring(0, 7));
          if (s.updated_at) taskMonths.add(s.updated_at.substring(0, 7));
        }
        if (carried[task.id]) taskMonths.add(yearMonth);

        if (!yearMonth || taskMonths.has(yearMonth)) {
          task.stages = stages;
          result.push(task);
        }
      }
    }
    return result;
  }

  addTask(task) {
    const id = this._nextId('task');
    const now = new Date().toISOString();
    const createdAt = task.createdAt || now;
    this._appendRows(SHEETS.tasks, [[
      id, task.categoryId, task.title, task.description || '', task.status || 'created',
      task.progress || 0, task.isRoutine ? 1 : 0, createdAt, '', ''
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
    let progress = parseInt(task.progress !== undefined ? task.progress : existing[5]) || 0;

    if (task.status === 'in_progress' && oldStatus === 'created' && !started) {
      started = now;
    }
    if (task.status === 'completed' && oldStatus !== 'completed') {
      completed = now;
      progress = 100;
    }
    if (oldStatus === 'completed' && task.status !== 'completed') {
      completed = '';
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

    const stageRows = this._sheetToJson(SHEETS.stages);
    stageRows.push([id, stage.taskId, nextIndex, stage.note || '', 0, now, now]);
    this._replaceSheet(SHEETS.stages, stageRows);

    const allStages = stageRows.filter(r => r[1] == stage.taskId);
    const filledCount = allStages.filter(r => r[3] && String(r[3]).trim() !== '').length;
    const progress = allStages.length > 0 ? Math.round((filledCount / allStages.length) * 100) : 0;

    const taskRows = this._sheetToJson(SHEETS.tasks);
    const tIdx = taskRows.findIndex(r => r[0] == stage.taskId);
    if (tIdx >= 0) {
      if (taskRows[tIdx][4] === 'created') {
        taskRows[tIdx][4] = 'in_progress';
        taskRows[tIdx][8] = now;
      }
      taskRows[tIdx][5] = progress;
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
      rows[idx][6] = new Date().toISOString();
      this._replaceSheet(SHEETS.stages, rows);

      const taskId = rows[idx][1];
      const taskStages = rows.filter(r => r[1] == taskId);
      const filledCount = taskStages.filter(r => r[3] && String(r[3]).trim() !== '').length;
      const progress = taskStages.length > 0 ? Math.round((filledCount / taskStages.length) * 100) : 0;

      const taskRows = this._sheetToJson(SHEETS.tasks);
      const tIdx = taskRows.findIndex(r => r[0] == taskId);
      if (tIdx >= 0) {
        taskRows[tIdx][5] = progress;
        this._replaceSheet(SHEETS.tasks, taskRows);
      }

      this.save();
    }
  }

  deleteStage(stageId) {
    const rows = this._sheetToJson(SHEETS.stages);
    const target = rows.find(r => r[0] == stageId);
    if (!target) return;
    const taskId = target[1];
    const filtered = rows.filter(r => r[0] != stageId);
    this._replaceSheet(SHEETS.stages, filtered);

    const taskStages = filtered.filter(r => r[1] == taskId);
    const filledCount = taskStages.filter(r => r[3] && String(r[3]).trim() !== '').length;
    const progress = taskStages.length > 0 ? Math.round((filledCount / taskStages.length) * 100) : 0;

    const taskRows = this._sheetToJson(SHEETS.tasks);
    const tIdx = taskRows.findIndex(r => r[0] == taskId);
    if (tIdx >= 0) {
      if (taskStages.length === 0) {
        taskRows[tIdx][4] = 'created';
      }
      taskRows[tIdx][5] = progress;
      this._replaceSheet(SHEETS.tasks, taskRows);
    }

    this.save();
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
      if (task.completed_at) continue;
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

  carryOverTasks(targetYearMonth, categoryId) {
    const allTasks = this._sheetToJson(SHEETS.tasks).map(r => ({
      id: r[0], category_id: r[1], status: r[4], is_routine: r[6], created_at: r[7]
    }));
    const nonRoutineTasks = allTasks.filter(t =>
      t.category_id == categoryId && !t.is_routine && t.status !== 'completed'
    );

    const completedTaskIds = allTasks
      .filter(t => t.category_id == categoryId && !t.is_routine && t.status === 'completed')
      .map(t => t.id);

    let carries = this._sheetToJson(SHEETS.carry_overs);
    if (completedTaskIds.length > 0) {
      carries = carries.filter(r => !completedTaskIds.includes(r[0]));
    }

    const existingCarries = carries
      .filter(r => r[1] === targetYearMonth)
      .map(r => r[0]);
    const newCarries = [];
    for (const task of nonRoutineTasks) {
      const createdYm = task.created_at ? task.created_at.substring(0, 7) : '';
      if (createdYm && createdYm > targetYearMonth) continue;
      if (!existingCarries.includes(task.id)) {
        newCarries.push([task.id, targetYearMonth, new Date().toISOString()]);
      }
    }
    if (newCarries.length > 0) {
      carries = [...carries, ...newCarries];
    }
    this._replaceSheet(SHEETS.carry_overs, carries);
    if (newCarries.length > 0 || completedTaskIds.length > 0) {
      this.save();
    }
    return newCarries.length;
  }

  getCarriedTasks(categoryId, yearMonth) {
    const taskIds = this._sheetToJson(SHEETS.tasks)
      .filter(r => r[1] == categoryId && !r[6])
      .map(r => r[0]);
    const rows = this._sheetToJson(SHEETS.carry_overs)
      .filter(r => r[1] === yearMonth && taskIds.includes(r[0]));
    const map = {};
    for (const r of rows) {
      map[r[0]] = r[2];
    }
    return map;
  }

  getAllTasksByYear(year) {
    const cats = this.getCategories();
    const allTasks = this._sheetToJson(SHEETS.tasks).map(r => ({
      id: r[0], category_id: r[1], title: r[2], description: r[3], status: r[4],
      progress: r[5], is_routine: r[6], created_at: r[7], started_at: r[8], completed_at: r[9]
    }));

    const result = {};
    for (let m = 1; m <= 12; m++) {
      const ym = `${year}-${String(m).padStart(2, '0')}`;
      result[ym] = [];
    }

    for (const task of allTasks) {
      const createdYm = task.created_at ? task.created_at.substring(0, 7) : '';
      const completedYm = task.completed_at ? task.completed_at.substring(0, 7) : '';
      const taskCategory = cats.find(c => c.id == task.category_id);

      for (let m = 1; m <= 12; m++) {
        const ym = `${year}-${String(m).padStart(2, '0')}`;

        if (createdYm && createdYm > ym) continue;
        if (completedYm && completedYm < ym) continue;

        let visible = false;
        if (task.is_routine) {
          visible = true;
        } else {
          if (createdYm === ym) { visible = true; }
          else if (completedYm === ym) { visible = true; }
          else {
            const stages = this._sheetToJson(SHEETS.stages)
              .filter(r => r[1] == task.id);
            for (const s of stages) {
              if (s[5] && s[5].substring(0, 7) === ym) { visible = true; break; }
              if (s[6] && s[6].substring(0, 7) === ym) { visible = true; break; }
            }
            if (!visible) {
              const carried = this._sheetToJson(SHEETS.carry_overs)
                .filter(r => r[0] == task.id && r[1] === ym);
              if (carried.length > 0) visible = true;
            }
          }
        }

        if (visible) {
          result[ym].push({
            id: task.id,
            title: task.title,
            status: task.status,
            progress: task.progress,
            is_routine: task.is_routine,
            categoryName: taskCategory ? taskCategory.name : '',
            categoryId: task.category_id,
            created_at: task.created_at
          });
        }
      }
    }

    return result;
  }
}

module.exports = ExcelDB;
