// Routine record CRUD operations

const { SHEETS } = require('./core');

module.exports = {
  getRoutineRecord: function(taskId, yearMonth) {
    const recs = this._sheetToJson(SHEETS.routine_records)
      .filter(function(r) { return r[1] == taskId && r[2] === yearMonth; })
      .map(function(r) { return { id: r[0], task_id: r[1], year_month: r[2], quantity: r[3], filled_at: r[4] }; });
    return recs[0] || null;
  },

  fillRoutine: function(record) {
    const rows = this._sheetToJson(SHEETS.routine_records);
    const idx = rows.findIndex(function(r) { return r[1] == record.taskId && r[2] === record.yearMonth; });
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
  },

  getLastMonthRoutine: function(taskId, yearMonth) {
    const parts = yearMonth.split('-').map(Number);
    const lastM = parts[1] === 1 ? 12 : parts[1] - 1;
    const lastY = parts[1] === 1 ? parts[0] - 1 : parts[0];
    const lastYm = lastY + '-' + String(lastM).padStart(2, '0');
    const recs = this._sheetToJson(SHEETS.routine_records)
      .filter(function(r) { return r[1] == taskId && r[2] === lastYm; })
      .map(function(r) { return { id: r[0], task_id: r[1], year_month: r[2], quantity: r[3], filled_at: r[4] }; });
    return recs[0] || null;
  },

  getRoutineTasksByCategory: function(categoryId) {
    return this._sheetToJson(SHEETS.tasks)
      .filter(function(r) { return r[1] == categoryId && r[6] == 1; })
      .map(function(r) {
        return {
          id: r[0], category_id: r[1], title: r[2], description: r[3], status: r[4],
          progress: r[5], is_routine: r[6], created_at: r[7], started_at: r[8], completed_at: r[9], sort_order: r[10]
        };
      });
  },

  checkRoutineUnfilled: function(categoryId, yearMonth) {
    const routineTasks = this.getRoutineTasksByCategory(categoryId);
    const parts = yearMonth.split('-').map(Number);
    const lastM = parts[1] === 1 ? 12 : parts[1] - 1;
    const lastY = parts[1] === 1 ? parts[0] - 1 : parts[0];
    const lastYm = lastY + '-' + String(lastM).padStart(2, '0');

    const unfilled = [];
    for (var i = 0; i < routineTasks.length; i++) {
      var task = routineTasks[i];
      if (task.completed_at) continue;
      const lastRec = this.getRoutineRecord(task.id, lastYm);
      const curRec = this.getRoutineRecord(task.id, yearMonth);
      if (!lastRec) {
        unfilled.push({ task: task, lastYm: lastYm, isPriorMonth: true });
      }
      if (!curRec) {
        var already = false;
        for (var j = 0; j < unfilled.length; j++) {
          if (unfilled[j].task.id === task.id) { already = true; break; }
        }
        if (!already) {
          unfilled.push({ task: task, yearMonth: yearMonth, isPriorMonth: false });
        }
      }
    }
    return unfilled;
  }
};
