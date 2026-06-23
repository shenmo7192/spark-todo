// Export helpers: getExportData, getAllActiveMonths, getAllTasksByYear

const { SHEETS } = require('./core');

module.exports = {
  getExportData: function() {
    const tasks = this._sheetToJson(SHEETS.tasks).map(function(r) {
      return {
        id: r[0], category_id: r[1], title: r[2], description: r[3], status: r[4],
        progress: r[5], is_routine: r[6], created_at: r[7], started_at: r[8], completed_at: r[9], sort_order: r[10],
        importance: parseInt(r[11]) || 1, manual_duration: r[12] || '', contact_person: r[13] || ''
      };
    });
    const cats = this.getCategories();
    const topcs = this.getTopics();
    for (var i = 0; i < tasks.length; i++) {
      var task = tasks[i];
      task.category = cats.find(function(c) { return c.id == task.category_id; });
      if (task.category) {
        task.topic = topcs.find(function(t) { return t.id == task.category.topic_id; });
      }
      if (task.is_routine) {
        task.records = this._sheetToJson(SHEETS.routine_records)
          .filter(function(r) { return r[1] == task.id; })
          .map(function(r) { return { id: r[0], task_id: r[1], year_month: r[2], quantity: r[3], filled_at: r[4] }; })
          .sort(function(a, b) { return a.year_month.localeCompare(b.year_month); });
      } else {
        task.stages = this._sheetToJson(SHEETS.stages)
          .filter(function(r) { return r[1] == task.id; })
          .map(function(r) { return { id: r[0], task_id: r[1], stage_index: r[2], note: r[3], progress_value: r[4], created_at: r[5], updated_at: r[6], is_completed: r[7] }; })
          .sort(function(a, b) { return a.stage_index - b.stage_index; });
      }
    }
    return tasks;
  },

  getAllActiveMonths: function() {
    const months = new Set();
    this._sheetToJson(SHEETS.stages).forEach(function(r) {
      if (r[5]) months.add(r[5].substring(0, 7));
      if (r[6]) months.add(r[6].substring(0, 7));
    });
    this._sheetToJson(SHEETS.tasks).forEach(function(r) {
      if (r[9]) months.add(r[9].substring(0, 7));
    });
    this._sheetToJson(SHEETS.routine_records).forEach(function(r) {
      if (r[2]) months.add(r[2]);
    });
    return Array.from(months).filter(Boolean).sort();
  },

  getAllTasksByYear: function(year) {
    const cats = this.getCategories();
    const allTasks = this._sheetToJson(SHEETS.tasks).map(function(r) {
      return {
        id: r[0], category_id: r[1], title: r[2], description: r[3], status: r[4],
        progress: r[5], is_routine: r[6], created_at: r[7], started_at: r[8], completed_at: r[9], sort_order: r[10],
        importance: parseInt(r[11]) || 1, manual_duration: r[12] || '', contact_person: r[13] || ''
      };
    });

    const result = {};
    for (let m = 1; m <= 12; m++) {
      const ym = year + '-' + String(m).padStart(2, '0');
      result[ym] = [];
    }

    for (var ti = 0; ti < allTasks.length; ti++) {
      var task = allTasks[ti];
      const createdYm = task.created_at ? task.created_at.substring(0, 7) : '';
      const completedYm = task.completed_at ? task.completed_at.substring(0, 7) : '';
      const taskCategory = cats.find(function(c) { return c.id == task.category_id; });

      for (let m = 1; m <= 12; m++) {
        const ym = year + '-' + String(m).padStart(2, '0');

        if (taskCategory && taskCategory.ended_at) {
          const endedYm = taskCategory.ended_at.substring(0, 7);
          if (ym > endedYm) continue;
        }

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
              .filter(function(r) { return r[1] == task.id; });
            for (var si = 0; si < stages.length; si++) {
              if (stages[si][5] && stages[si][5].substring(0, 7) === ym) { visible = true; break; }
              if (stages[si][6] && stages[si][6].substring(0, 7) === ym) { visible = true; break; }
            }
            if (!visible) {
              const carried = this._sheetToJson(SHEETS.carry_overs)
                .filter(function(r) { return r[0] == task.id && r[1] === ym; });
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
};
