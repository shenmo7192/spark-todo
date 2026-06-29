// Stage CRUD operations

const { SHEETS } = require('./core');

module.exports = {
  getStages: function(taskId) {
    return this._sheetToJson(SHEETS.stages)
      .filter(function(r) { return r[1] == taskId; })
      .map(function(r) {
        return { id: r[0], task_id: r[1], stage_index: r[2], note: r[3], progress_value: r[4], created_at: r[5], updated_at: r[6], is_completed: r[7] };
      })
      .sort(function(a, b) { return b.stage_index - a.stage_index; });
  },

  addStage: function(stage) {
    const all = this._sheetToJson(SHEETS.stages).filter(function(r) { return r[1] == stage.taskId; });
    const maxIndex = all.length ? Math.max.apply(null, all.map(function(s) { return s[2]; })) : 0;
    const nextIndex = maxIndex + 1;
    const id = this._nextId('stage');
    const now = new Date().toISOString();

    const stageRows = this._sheetToJson(SHEETS.stages);
    stageRows.push([id, stage.taskId, nextIndex, stage.note || '', 0, now, now, 0]);
    this._replaceSheet(SHEETS.stages, stageRows);

    const allStages = stageRows.filter(function(r) { return r[1] == stage.taskId; });
    const filledCount = allStages.filter(function(r) { return r[7] == 1; }).length;
    const progress = allStages.length > 0 ? Math.round((filledCount / allStages.length) * 100) : 0;

    const taskRows = this._sheetToJson(SHEETS.tasks);
    const tIdx = taskRows.findIndex(function(r) { return r[0] == stage.taskId; });
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
  },

  updateStage: function(stage) {
    const rows = this._sheetToJson(SHEETS.stages);
    const idx = rows.findIndex(function(r) { return r[0] == stage.id; });
    if (idx >= 0) {
      if (stage.note !== undefined) rows[idx][3] = stage.note || '';
      if (stage.is_completed !== undefined) rows[idx][7] = stage.is_completed;
      rows[idx][6] = new Date().toISOString();
      this._replaceSheet(SHEETS.stages, rows);

      const taskId = rows[idx][1];
      const taskStages = rows.filter(function(r) { return r[1] == taskId; });
      const filledCount = taskStages.filter(function(r) { return r[7] == 1; }).length;
      const progress = taskStages.length > 0 ? Math.round((filledCount / taskStages.length) * 100) : 0;

      const taskRows = this._sheetToJson(SHEETS.tasks);
      const tIdx = taskRows.findIndex(function(r) { return r[0] == taskId; });
      if (tIdx >= 0) {
        taskRows[tIdx][5] = progress;
        this._replaceSheet(SHEETS.tasks, taskRows);
      }

      this.save();
    }
  },

  deleteStage: function(stageId) {
    const rows = this._sheetToJson(SHEETS.stages);
    const target = rows.find(function(r) { return r[0] == stageId; });
    if (!target) return;
    const taskId = target[1];
    const filtered = rows.filter(function(r) { return r[0] != stageId; });
    this._replaceSheet(SHEETS.stages, filtered);

    const taskStages = filtered.filter(function(r) { return r[1] == taskId; });
    const filledCount = taskStages.filter(function(r) { return r[7] == 1; }).length;
    const progress = taskStages.length > 0 ? Math.round((filledCount / taskStages.length) * 100) : 0;

    const taskRows = this._sheetToJson(SHEETS.tasks);
    const tIdx = taskRows.findIndex(function(r) { return r[0] == taskId; });
    if (tIdx >= 0) {
      if (taskStages.length === 0) {
        taskRows[tIdx][4] = 'created';
      }
      taskRows[tIdx][5] = progress;
      this._replaceSheet(SHEETS.tasks, taskRows);
    }

    this.save();
  },

  reorderStages: function(taskId, stageIds) {
    const allRows = this._sheetToJson(SHEETS.stages);
    for (var i = 0; i < stageIds.length; i++) {
      var idx = allRows.findIndex(function(r) { return r[0] == stageIds[i] && r[1] == taskId; });
      if (idx >= 0) {
        allRows[idx][2] = i + 1;
      }
    }
    this._replaceSheet(SHEETS.stages, allRows);
    this.save();
  }
};
