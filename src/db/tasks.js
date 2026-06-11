// Task CRUD + carry over + batch reorder

const { SHEETS } = require('./core');

module.exports = {
  getTaskById: function(taskId) {
    const allTasks = this._sheetToJson(SHEETS.tasks).map(function(r) {
      return {
        id: r[0], category_id: r[1], title: r[2], description: r[3], status: r[4],
        progress: r[5], is_routine: r[6], created_at: r[7], started_at: r[8], completed_at: r[9], sort_order: r[10],
        importance: parseInt(r[11]) || 1, manual_duration: r[12] || '', contact_person: r[13] || ''
      };
    });
    const task = allTasks.find(function(t) { return t.id == taskId; });
    if (!task) return null;
    if (task.is_routine) {
      task.routineRecord = null;
    } else {
      task.stages = this._sheetToJson(SHEETS.stages)
        .filter(function(r) { return r[1] == task.id; })
        .map(function(r) {
          return { id: r[0], task_id: r[1], stage_index: r[2], note: r[3], progress_value: r[4], created_at: r[5], updated_at: r[6], is_completed: r[7] };
        })
        .sort(function(a, b) { return a.stage_index - b.stage_index; });
    }
    return task;
  },

  getTasks: function(categoryId, yearMonth) {
    const allTasks = this._sheetToJson(SHEETS.tasks).map(function(r) {
      return {
        id: r[0], category_id: r[1], title: r[2], description: r[3], status: r[4],
        progress: r[5], is_routine: r[6], created_at: r[7], started_at: r[8], completed_at: r[9], sort_order: r[10],
        importance: parseInt(r[11]) || 1, manual_duration: r[12] || '', contact_person: r[13] || ''
      };
    });
    const tasks = allTasks.filter(function(t) { return t.category_id == categoryId; });
    const carried = this.getCarriedTasks(categoryId, yearMonth);
    const result = [];

    for (var ti = 0; ti < tasks.length; ti++) {
      var task = tasks[ti];
      if (task.is_routine) {
        if (yearMonth) {
          const createdYm = task.created_at ? task.created_at.substring(0, 7) : '';
          if (createdYm && createdYm > yearMonth) continue;
          const completedYm = task.completed_at ? task.completed_at.substring(0, 7) : '';
          if (completedYm && completedYm < yearMonth) continue;
        }
        const recs = this._sheetToJson(SHEETS.routine_records)
          .filter(function(r) { return r[1] == task.id && r[2] === yearMonth; })
          .map(function(r) { return { id: r[0], task_id: r[1], year_month: r[2], quantity: r[3], filled_at: r[4] }; });
        task.routineRecord = recs[0] || null;
        result.push(task);
      } else {
        const stages = this._sheetToJson(SHEETS.stages)
          .filter(function(r) { return r[1] == task.id; })
          .map(function(r) { return { id: r[0], task_id: r[1], stage_index: r[2], note: r[3], progress_value: r[4], created_at: r[5], updated_at: r[6], is_completed: r[7] }; })
          .sort(function(a, b) { return a.stage_index - b.stage_index; });

        if (yearMonth) {
          const createdYm = task.created_at ? task.created_at.substring(0, 7) : '';
          if (createdYm && createdYm > yearMonth) continue;
          const completedYm = task.completed_at ? task.completed_at.substring(0, 7) : '';
          if (completedYm && completedYm < yearMonth) continue;
        }

        const taskMonths = new Set();
        if (task.created_at) taskMonths.add(task.created_at.substring(0, 7));
        if (task.completed_at) taskMonths.add(task.completed_at.substring(0, 7));
        for (var si = 0; si < stages.length; si++) {
          var s = stages[si];
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
  },

  addTask: function(task) {
    const id = this._nextId('task');
    const now = new Date().toISOString();
    const createdAt = task.createdAt || now;
    const allTaskRows = this._sheetToJson(SHEETS.tasks);
    for (var i = 0; i < allTaskRows.length; i++) {
      var row = allTaskRows[i];
      if (row[1] == task.categoryId) {
        row[10] = (parseInt(row[10]) || 0) + 1;
      }
    }
    allTaskRows.push([
      id, task.categoryId, task.title, task.description || '', task.status || 'created',
      task.progress || 0, task.isRoutine ? 1 : 0, createdAt, '', '', 1,
      task.importance || 1, task.manual_duration || '', task.contact_person || ''
    ]);
    this._replaceSheet(SHEETS.tasks, allTaskRows);
    this.save();
    return id;
  },

  updateTask: function(task) {
    const rows = this._sheetToJson(SHEETS.tasks);
    const idx = rows.findIndex(function(r) { return r[0] == task.id; });
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

    rows[idx] = [
      task.id, existing[1], task.title, task.description || '', task.status, progress,
      existing[6], existing[7], started, completed, existing[10],
      task.importance !== undefined ? task.importance : (existing[11] || 1),
      task.manual_duration !== undefined ? task.manual_duration : (existing[12] || ''),
      task.contact_person !== undefined ? task.contact_person : (existing[13] || '')
    ];
    this._replaceSheet(SHEETS.tasks, rows);
    this.save();
  },

  changeTaskCategory: function(taskId, newCategoryId) {
    const cats = this.getCategories();
    const targetCat = cats.find(function(c) { return c.id == newCategoryId; });
    if (!targetCat) return;
    const newIsRoutine = targetCat.is_routine;

    const rows = this._sheetToJson(SHEETS.tasks);
    const idx = rows.findIndex(function(r) { return r[0] == taskId; });
    if (idx < 0) return;

    const taskIsRoutine = parseInt(rows[idx][6]) || 0;
    if (taskIsRoutine !== newIsRoutine) return;

    rows[idx][1] = newCategoryId;
    rows[idx][6] = newIsRoutine;
    this._replaceSheet(SHEETS.tasks, rows);
    this.save();
  },

  bulkChangeTaskCategory: function(taskIds, newCategoryId) {
    const cats = this.getCategories();
    const targetCat = cats.find(function(c) { return c.id == newCategoryId; });
    if (!targetCat) return;
    const newIsRoutine = targetCat.is_routine;

    const rows = this._sheetToJson(SHEETS.tasks);
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (taskIds.includes(row[0])) {
        const taskIsRoutine = parseInt(row[6]) || 0;
        if (taskIsRoutine !== newIsRoutine) continue;
        row[1] = newCategoryId;
        row[6] = newIsRoutine;
      }
    }
    this._replaceSheet(SHEETS.tasks, rows);
    this.save();
  },

  deleteTask: function(id) {
    const tasks = this._sheetToJson(SHEETS.tasks).filter(function(r) { return r[0] != id; });
    this._replaceSheet(SHEETS.tasks, tasks);
    const stages = this._sheetToJson(SHEETS.stages).filter(function(r) { return r[1] != id; });
    this._replaceSheet(SHEETS.stages, stages);
    const routines = this._sheetToJson(SHEETS.routine_records).filter(function(r) { return r[1] != id; });
    this._replaceSheet(SHEETS.routine_records, routines);
    this.save();
  },

  batchReorderTasks: function(categoryId, taskIds) {
    const rows = this._sheetToJson(SHEETS.tasks);
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row[1] == categoryId) {
        const pos = taskIds.indexOf(row[0]);
        if (pos >= 0) {
          row[10] = pos + 1;
        }
      }
    }
    this._replaceSheet(SHEETS.tasks, rows);
    this.save();
  },

  carryOverTasks: function(targetYearMonth, categoryId) {
    const allTasks = this._sheetToJson(SHEETS.tasks).map(function(r) {
      return { id: r[0], category_id: r[1], status: r[4], is_routine: r[6], created_at: r[7] };
    });
    const nonRoutineTasks = allTasks.filter(function(t) {
      return t.category_id == categoryId && !t.is_routine && t.status !== 'completed';
    });

    const completedTaskIds = allTasks
      .filter(function(t) { return t.category_id == categoryId && !t.is_routine && t.status === 'completed'; })
      .map(function(t) { return t.id; });

    let carries = this._sheetToJson(SHEETS.carry_overs);
    if (completedTaskIds.length > 0) {
      carries = carries.filter(function(r) { return !completedTaskIds.includes(r[0]); });
    }

    const existingCarries = carries
      .filter(function(r) { return r[1] === targetYearMonth; })
      .map(function(r) { return r[0]; });
    const newCarries = [];
    for (var i = 0; i < nonRoutineTasks.length; i++) {
      var task = nonRoutineTasks[i];
      const createdYm = task.created_at ? task.created_at.substring(0, 7) : '';
      if (createdYm && createdYm > targetYearMonth) continue;
      if (!existingCarries.includes(task.id)) {
        newCarries.push([task.id, targetYearMonth, new Date().toISOString()]);
      }
    }
    if (newCarries.length > 0) {
      carries = carries.concat(newCarries);
    }
    this._replaceSheet(SHEETS.carry_overs, carries);
    if (newCarries.length > 0 || completedTaskIds.length > 0) {
      this.save();
    }
    return newCarries.length;
  },

  getCarriedTasks: function(categoryId, yearMonth) {
    const taskIds = this._sheetToJson(SHEETS.tasks)
      .filter(function(r) { return r[1] == categoryId && !r[6]; })
      .map(function(r) { return r[0]; });
    const rows = this._sheetToJson(SHEETS.carry_overs)
      .filter(function(r) { return r[1] === yearMonth && taskIds.includes(r[0]); });
    const map = {};
    for (var i = 0; i < rows.length; i++) {
      map[rows[i][0]] = rows[i][2];
    }
    return map;
  }
};
