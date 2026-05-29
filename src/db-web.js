const DB_NAME = 'spark-todo';
const DB_VERSION = 1;

const STORES = {
  meta: { keyPath: 'key' },
  categories: { keyPath: 'id' },
  tasks: { keyPath: 'id' },
  stages: { keyPath: 'id' },
  routine_records: { keyPath: 'id' },
  carry_overs: {}
};

class IndexedDBStorage {
  constructor() {
    this.db = null;
    this.ready = this._open();
  }

  _open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        for (const [name, opts] of Object.entries(STORES)) {
          if (!db.objectStoreNames.contains(name)) {
            if (name === 'carry_overs') {
              db.createObjectStore(name, { keyPath: ['task_id', 'year_month'] });
            } else {
              db.createObjectStore(name, { keyPath: opts.keyPath });
            }
          }
        }
      };
      request.onsuccess = (event) => {
        this.db = event.target.result;
        this._seedDefaultData().then(resolve).catch(resolve);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async _seedDefaultData() {
    const cats = await this._getAll('categories');
    if (cats.length === 0) {
      await this._put('categories', { id: 1, name: '工作任务', is_routine: 0, sort_order: 0, created_at: new Date().toISOString() });
      await this._put('categories', { id: 2, name: '日常工作', is_routine: 1, sort_order: 1, created_at: new Date().toISOString() });
      await this._put('meta', { key: 'last_category_id', value: 2 });
      await this._put('meta', { key: 'last_task_id', value: 0 });
      await this._put('meta', { key: 'last_stage_id', value: 0 });
      await this._put('meta', { key: 'last_routine_id', value: 0 });
    }
  }

  async _getAll(storeName) {
    return new Promise((resolve) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  }

  async _get(storeName, key) {
    return new Promise((resolve) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  }

  async _put(storeName, value) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async _delete(storeName, key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async _clear(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async _getMeta(key) {
    const row = await this._get('meta', key);
    return row ? row.value : undefined;
  }

  async _setMeta(key, value) {
    await this._put('meta', { key, value });
  }

  async _nextId(type) {
    const key = `last_${type}_id`;
    let id = parseInt(await this._getMeta(key) || '0', 10);
    id += 1;
    await this._setMeta(key, id);
    return id;
  }

  async getCategories() {
    const cats = await this._getAll('categories');
    return cats.sort((a, b) => a.sort_order - b.sort_order);
  }

  async addCategory(name, isRoutine) {
    const cats = await this.getCategories();
    const maxOrder = cats.length ? Math.max(...cats.map(c => c.sort_order)) : -1;
    const id = await this._nextId('category');
    await this._put('categories', {
      id, name, is_routine: isRoutine ? 1 : 0, sort_order: maxOrder + 1,
      created_at: new Date().toISOString()
    });
    return id;
  }

  async updateCategory(id, name, isRoutine) {
    const cat = await this._get('categories', id);
    if (!cat) return false;
    cat.name = name;
    if (isRoutine !== undefined) cat.is_routine = isRoutine ? 1 : 0;
    await this._put('categories', cat);
    return true;
  }

  async moveCategory(id, direction) {
    const cats = await this.getCategories();
    const idx = cats.findIndex(c => c.id === id);
    if (idx < 0) return false;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= cats.length) return false;
    const tmp = cats[idx].sort_order;
    cats[idx].sort_order = cats[targetIdx].sort_order;
    cats[targetIdx].sort_order = tmp;
    await this._put('categories', cats[idx]);
    await this._put('categories', cats[targetIdx]);
    return true;
  }

  async deleteCategory(id) {
    const tasks = await this._getAll('tasks');
    const taskIds = tasks.filter(t => t.category_id === id).map(t => t.id);

    const routines = await this._getAll('routine_records');
    for (const r of routines) { if (taskIds.includes(r.task_id)) await this._delete('routine_records', r.id); }

    const stages = await this._getAll('stages');
    for (const s of stages) { if (taskIds.includes(s.task_id)) await this._delete('stages', s.id); }

    const carries = await this._getAll('carry_overs');
    for (const c of carries) { if (taskIds.includes(c.task_id)) await this._delete('carry_overs', [c.task_id, c.year_month]); }

    for (const tid of taskIds) { await this._delete('tasks', tid); }
    await this._delete('categories', id);
  }

  async getTaskById(taskId) {
    const task = await this._get('tasks', taskId);
    if (!task) return null;
    if (task.is_routine) {
      task.routineRecord = null;
    } else {
      const allStages = await this._getAll('stages');
      task.stages = allStages
        .filter(s => s.task_id === task.id)
        .sort((a, b) => a.stage_index - b.stage_index);
    }
    return task;
  }

  async getTasks(categoryId, yearMonth) {
    const allTasks = await this._getAll('tasks');
    const tasks = allTasks.filter(t => t.category_id === categoryId);
    const carried = await this._getCarriedTasks(categoryId, yearMonth);
    const result = [];

    for (const task of tasks) {
      if (task.is_routine) {
        if (yearMonth) {
          const createdYm = task.created_at ? task.created_at.substring(0, 7) : '';
          if (createdYm && createdYm > yearMonth) continue;
          const completedYm = task.completed_at ? task.completed_at.substring(0, 7) : '';
          if (completedYm && completedYm < yearMonth) continue;
        }
        const recs = await this._getAll('routine_records');
        const rec = recs.find(r => r.task_id === task.id && r.year_month === yearMonth) || null;
        task.routineRecord = rec;
        result.push(task);
      } else {
        const stages = (await this._getAll('stages'))
          .filter(s => s.task_id === task.id)
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

  async addTask(task) {
    const id = await this._nextId('task');
    const now = new Date().toISOString();
    const createdAt = task.createdAt || now;

    const allTasks = await this._getAll('tasks');
    const catTasks = allTasks.filter(t => t.category_id === task.categoryId);
    for (const t of catTasks) {
      t.sort_order = (parseInt(t.sort_order) || 0) + 1;
      await this._put('tasks', t);
    }

    await this._put('tasks', {
      id, category_id: task.categoryId, title: task.title,
      description: task.description || '', status: task.status || 'created',
      progress: task.progress || 0, is_routine: task.isRoutine ? 1 : 0,
      created_at: createdAt, started_at: '', completed_at: '', sort_order: 1
    });
    return id;
  }

  async updateTask(task) {
    const existing = await this._get('tasks', task.id);
    if (!existing) return;
    const oldStatus = existing.status;
    const now = new Date().toISOString();
    let started = existing.started_at;
    let completed = existing.completed_at;
    let progress = parseInt(task.progress !== undefined ? task.progress : existing.progress) || 0;

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

    existing.title = task.title;
    existing.description = task.description || '';
    existing.status = task.status;
    existing.progress = progress;
    existing.started_at = started;
    existing.completed_at = completed;
    await this._put('tasks', existing);
  }

  async changeTaskCategory(taskId, newCategoryId) {
    const task = await this._get('tasks', taskId);
    if (!task) return;
    task.category_id = newCategoryId;
    await this._put('tasks', task);
  }

  async bulkChangeTaskCategory(taskIds, newCategoryId) {
    for (const tid of taskIds) {
      const task = await this._get('tasks', tid);
      if (task) {
        task.category_id = newCategoryId;
        await this._put('tasks', task);
      }
    }
  }

  async deleteTask(id) {
    await this._delete('tasks', id);
    const stages = await this._getAll('stages');
    for (const s of stages) { if (s.task_id === id) await this._delete('stages', s.id); }
    const routines = await this._getAll('routine_records');
    for (const r of routines) { if (r.task_id === id) await this._delete('routine_records', r.id); }
  }

  async getStages(taskId) {
    const all = await this._getAll('stages');
    return all.filter(s => s.task_id === taskId)
      .sort((a, b) => b.stage_index - a.stage_index);
  }

  async addStage(stage) {
    const all = await this._getAll('stages');
    const taskStages = all.filter(s => s.task_id === stage.taskId);
    const maxIndex = taskStages.length ? Math.max(...taskStages.map(s => s.stage_index)) : 0;
    const nextIndex = maxIndex + 1;
    const id = await this._nextId('stage');
    const now = new Date().toISOString();

    await this._put('stages', {
      id, task_id: stage.taskId, stage_index: nextIndex,
      note: stage.note || '', progress_value: 0,
      created_at: now, updated_at: now, is_completed: 0
    });

    const allStages = await this._getAll('stages');
    const taskAllStages = allStages.filter(s => s.task_id === stage.taskId);
    const filledCount = taskAllStages.filter(s => s.is_completed === 1).length;
    const progress = taskAllStages.length > 0 ? Math.round((filledCount / taskAllStages.length) * 100) : 0;

    const task = await this._get('tasks', stage.taskId);
    if (task) {
      if (task.status === 'created') {
        task.status = 'in_progress';
        task.started_at = now;
      }
      task.progress = progress;
      await this._put('tasks', task);
    }
    return id;
  }

  async updateStage(stage) {
    const s = await this._get('stages', stage.id);
    if (!s) return;
    if (stage.note !== undefined) s.note = stage.note || '';
    if (stage.is_completed !== undefined) s.is_completed = stage.is_completed;
    s.updated_at = new Date().toISOString();
    await this._put('stages', s);

    const allStages = await this._getAll('stages');
    const taskStages = allStages.filter(st => st.task_id === s.task_id);
    const filledCount = taskStages.filter(st => st.is_completed === 1).length;
    const progress = taskStages.length > 0 ? Math.round((filledCount / taskStages.length) * 100) : 0;

    const task = await this._get('tasks', s.task_id);
    if (task) {
      task.progress = progress;
      await this._put('tasks', task);
    }
  }

  async deleteStage(stageId) {
    const target = await this._get('stages', stageId);
    if (!target) return;
    const taskId = target.task_id;
    await this._delete('stages', stageId);

    const allStages = await this._getAll('stages');
    const taskStages = allStages.filter(s => s.task_id === taskId);
    const filledCount = taskStages.filter(s => s.is_completed === 1).length;
    const progress = taskStages.length > 0 ? Math.round((filledCount / taskStages.length) * 100) : 0;

    const task = await this._get('tasks', taskId);
    if (task) {
      if (taskStages.length === 0) task.status = 'created';
      task.progress = progress;
      await this._put('tasks', task);
    }
  }

  async getRoutineRecord(taskId, yearMonth) {
    const all = await this._getAll('routine_records');
    return all.find(r => r.task_id === taskId && r.year_month === yearMonth) || null;
  }

  async fillRoutine(record) {
    const all = await this._getAll('routine_records');
    const existing = all.find(r => r.task_id === record.taskId && r.year_month === record.yearMonth);
    const now = new Date().toISOString();

    if (existing) {
      existing.quantity = record.quantity;
      existing.filled_at = now;
      await this._put('routine_records', existing);
    } else {
      const id = await this._nextId('routine');
      await this._put('routine_records', {
        id, task_id: record.taskId, year_month: record.yearMonth,
        quantity: record.quantity, filled_at: now
      });
    }
  }

  async getLastMonthRoutine(taskId, yearMonth) {
    const [y, m] = yearMonth.split('-').map(Number);
    const lastM = m === 1 ? 12 : m - 1;
    const lastY = m === 1 ? y - 1 : y;
    const lastYm = `${lastY}-${String(lastM).padStart(2, '0')}`;
    return this.getRoutineRecord(taskId, lastYm);
  }

  async getAllActiveMonths() {
    const months = new Set();
    const stages = await this._getAll('stages');
    stages.forEach(s => {
      if (s.created_at) months.add(s.created_at.substring(0, 7));
      if (s.updated_at) months.add(s.updated_at.substring(0, 7));
    });
    const tasks = await this._getAll('tasks');
    tasks.forEach(t => {
      if (t.completed_at) months.add(t.completed_at.substring(0, 7));
    });
    const routines = await this._getAll('routine_records');
    routines.forEach(r => {
      if (r.year_month) months.add(r.year_month);
    });
    return Array.from(months).filter(Boolean).sort();
  }

  async getExportData() {
    const tasks = await this._getAll('tasks');
    const cats = await this.getCategories();
    const allStages = await this._getAll('stages');
    const allRoutines = await this._getAll('routine_records');

    for (const task of tasks) {
      task.category = cats.find(c => c.id === task.category_id);
      if (task.is_routine) {
        task.records = allRoutines
          .filter(r => r.task_id === task.id)
          .sort((a, b) => a.year_month.localeCompare(b.year_month));
      } else {
        task.stages = allStages
          .filter(s => s.task_id === task.id)
          .sort((a, b) => a.stage_index - b.stage_index);
      }
    }
    return tasks;
  }

  async getRoutineTasksByCategory(categoryId) {
    const all = await this._getAll('tasks');
    return all.filter(t => t.category_id === categoryId && t.is_routine === 1);
  }

  async checkRoutineUnfilled(categoryId, yearMonth) {
    const routineTasks = await this.getRoutineTasksByCategory(categoryId);
    const [y, m] = yearMonth.split('-').map(Number);
    const lastM = m === 1 ? 12 : m - 1;
    const lastY = m === 1 ? y - 1 : y;
    const lastYm = `${lastY}-${String(lastM).padStart(2, '0')}`;

    const unfilled = [];
    for (const task of routineTasks) {
      if (task.completed_at) continue;
      const lastRec = await this.getRoutineRecord(task.id, lastYm);
      const curRec = await this.getRoutineRecord(task.id, yearMonth);
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

  async _getCarriedTasks(categoryId, yearMonth) {
    const taskIds = (await this._getAll('tasks'))
      .filter(t => t.category_id === categoryId && !t.is_routine)
      .map(t => t.id);
    const all = await this._getAll('carry_overs');
    const map = {};
    for (const r of all) {
      if (r.year_month === yearMonth && taskIds.includes(r.task_id)) {
        map[r.task_id] = r.carried_at;
      }
    }
    return map;
  }

  async carryOverTasks(targetYearMonth, categoryId) {
    const allTasks = await this._getAll('tasks');
    const nonRoutineTasks = allTasks.filter(t =>
      t.category_id === categoryId && !t.is_routine && t.status !== 'completed'
    );
    const completedTaskIds = allTasks
      .filter(t => t.category_id === categoryId && !t.is_routine && t.status === 'completed')
      .map(t => t.id);

    let carries = await this._getAll('carry_overs');
    if (completedTaskIds.length > 0) {
      for (const c of carries) {
        if (completedTaskIds.includes(c.task_id)) {
          await this._delete('carry_overs', [c.task_id, c.year_month]);
        }
      }
      carries = carries.filter(c => !completedTaskIds.includes(c.task_id));
    }

    const existingMap = {};
    for (const c of carries) {
      if (c.year_month === targetYearMonth) existingMap[c.task_id] = true;
    }

    let newCount = 0;
    for (const task of nonRoutineTasks) {
      const createdYm = task.created_at ? task.created_at.substring(0, 7) : '';
      if (createdYm && createdYm > targetYearMonth) continue;
      if (!existingMap[task.id]) {
        await this._put('carry_overs', {
          task_id: task.id, year_month: targetYearMonth,
          carried_at: new Date().toISOString()
        });
        newCount++;
      }
    }
    return newCount;
  }

  async getAllTasksByYear(year) {
    const cats = await this.getCategories();
    const allTasks = await this._getAll('tasks');
    const allStages = await this._getAll('stages');
    const allRoutines = await this._getAll('routine_records');
    const allCarries = await this._getAll('carry_overs');

    const result = {};
    for (let m = 1; m <= 12; m++) {
      const ym = `${year}-${String(m).padStart(2, '0')}`;
      result[ym] = [];
    }

    for (const task of allTasks) {
      const createdYm = task.created_at ? task.created_at.substring(0, 7) : '';
      const completedYm = task.completed_at ? task.completed_at.substring(0, 7) : '';
      const taskCategory = cats.find(c => c.id === task.category_id);

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
            const stages = allStages.filter(s => s.task_id === task.id);
            for (const s of stages) {
              if (s.created_at && s.created_at.substring(0, 7) === ym) { visible = true; break; }
              if (s.updated_at && s.updated_at.substring(0, 7) === ym) { visible = true; break; }
            }
            if (!visible) {
              const carried = allCarries.filter(c => c.task_id === task.id && c.year_month === ym);
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

  async batchReorderTasks(categoryId, taskIds) {
    const allTasks = await this._getAll('tasks');
    for (const task of allTasks) {
      if (task.category_id === categoryId) {
        const pos = taskIds.indexOf(task.id);
        if (pos >= 0) {
          task.sort_order = pos + 1;
          await this._put('tasks', task);
        }
      }
    }
  }

  async exportAllData() {
    return {
      categories: await this._getAll('categories'),
      tasks: await this._getAll('tasks'),
      stages: await this._getAll('stages'),
      routine_records: await this._getAll('routine_records'),
      carry_overs: await this._getAll('carry_overs'),
      meta: await this._getAll('meta')
    };
  }

  async importAllData(data, mode) {
    if (mode === 'replace') {
      for (const name of Object.keys(STORES)) {
        await this._clear(name);
      }
      await this._writeAllData(data);
    } else if (mode === 'merge') {
      await this._mergeData(data);
    }
  }

  async _writeAllData(data) {
    if (data.meta) for (const m of data.meta) await this._put('meta', m);
    if (data.categories) for (const c of data.categories) await this._put('categories', c);
    if (data.tasks) for (const t of data.tasks) await this._put('tasks', t);
    if (data.stages) for (const s of data.stages) await this._put('stages', s);
    if (data.routine_records) for (const r of data.routine_records) await this._put('routine_records', r);
    if (data.carry_overs) for (const c of data.carry_overs) await this._put('carry_overs', c);
  }

  async _mergeData(data) {
    const existingCats = await this._getAll('categories');
    const existingTasks = await this._getAll('tasks');
    const existingStages = await this._getAll('stages');
    const existingRoutines = await this._getAll('routine_records');
    const existingCarries = await this._getAll('carry_overs');

    const catMap = new Map(existingCats.map(c => [c.id, c]));
    const taskMap = new Map(existingTasks.map(t => [t.id, t]));
    const stageMap = new Map(existingStages.map(s => [s.id, s]));
    const routineMap = new Map(existingRoutines.map(r => [r.id, r]));
    const carrySet = new Set(existingCarries.map(c => `${c.task_id}|${c.year_month}`));

    if (data.categories) {
      for (const c of data.categories) {
        if (!catMap.has(c.id)) await this._put('categories', c);
      }
    }
    if (data.tasks) {
      for (const t of data.tasks) {
        if (!taskMap.has(t.id)) await this._put('tasks', t);
      }
    }
    if (data.stages) {
      for (const s of data.stages) {
        if (!stageMap.has(s.id)) await this._put('stages', s);
      }
    }
    if (data.routine_records) {
      for (const r of data.routine_records) {
        if (!routineMap.has(r.id)) await this._put('routine_records', r);
      }
    }
    if (data.carry_overs) {
      for (const c of data.carry_overs) {
        const key = `${c.task_id}|${c.year_month}`;
        if (!carrySet.has(key)) await this._put('carry_overs', c);
      }
    }

    if (data.meta) {
      const existingMeta = await this._getAll('meta');
      const metaMap = new Map(existingMeta.map(m => [m.key, m]));
      for (const m of data.meta) {
        if (m.key && m.key.startsWith('last_') && metaMap.has(m.key)) {
          const curVal = parseInt(metaMap.get(m.key).value) || 0;
          const newVal = parseInt(m.value) || 0;
          await this._setMeta(m.key, Math.max(curVal, newVal));
        } else if (!metaMap.has(m.key)) {
          await this._put('meta', m);
        }
      }
    }
  }
}

window.IndexedDBStorage = IndexedDBStorage;
