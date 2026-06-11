// Ledger export – 台账导出

function exportToExcel(targetPath, fromMonth, toMonth) {
  const xlsx = require('xlsx-js-style');
  const path = require('path');
  const fs = require('fs');

  const tasks = this.db.getExportData();
  const wb = xlsx.utils.book_new();

  const yearMonths = _collectYearMonths(tasks);
  let sortedMonths = Array.from(yearMonths).filter(Boolean).sort();

  if (fromMonth && toMonth) {
    sortedMonths = sortedMonths.filter(function(ym) { return ym >= fromMonth && ym <= toMonth; });
  }

  if (sortedMonths.length === 0) {
    const ws = xlsx.utils.aoa_to_sheet([['暂无数据']]);
    xlsx.utils.book_append_sheet(wb, ws, '无数据');
  }

  const allBlocks = [];

  for (const ym of sortedMonths) {
    const rows = [this._headerRow()];
    const rowMetas = [null];

    for (const task of tasks) {
      if (task.is_routine) {
        _exportRoutineRow.call(this, task, ym, rows, rowMetas);
      } else {
        _exportStagesForMonth.call(this, task, ym, rows, sortedMonths, rowMetas);
      }
    }

    if (rows.length > 1) {
      const taskGroups = this._rowMetasToTaskGroups(rows, rowMetas);
      const ws = this._createStyledSheet(rows, taskGroups, rowMetas);
      xlsx.utils.book_append_sheet(wb, ws, ym);
      allBlocks.push({ rows: rows.slice(1), metas: rowMetas.slice(1), ym: ym });
    }
  }

  if (allBlocks.length > 0) {
    const mergedRows = [this._headerRow()];
    const mergedMetas = [null];

    for (let bi = 0; bi < allBlocks.length; bi++) {
      const block = allBlocks[bi];
      const sepRow = ['── ' + block.ym + ' ──', '', '', '', '', '', '', '', '', '', '', ''];
      mergedRows.push(sepRow);
      mergedMetas.push(null);

      for (let i = 0; i < block.rows.length; i++) {
        mergedRows.push(block.rows[i]);
        mergedMetas.push(block.metas[i]);
      }
    }

    const mergedGroups = this._rowMetasToTaskGroups(mergedRows, mergedMetas);
    const wsMerged = this._createStyledSheet(mergedRows, mergedGroups, mergedMetas);
    xlsx.utils.book_append_sheet(wb, wsMerged, '融合任务');
  }

  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  xlsx.writeFile(wb, targetPath);
  return targetPath;
}

function _collectYearMonths(tasks) {
  const months = new Set();
  for (const task of tasks) {
    if (task.created_at) months.add(task.created_at.substring(0, 7));
    if (task.started_at) months.add(task.started_at.substring(0, 7));
    if (task.completed_at) months.add(task.completed_at.substring(0, 7));
    if (task.is_routine) {
      for (const r of (task.records || [])) {
        if (r.year_month) months.add(r.year_month);
      }
    } else {
      for (const s of (task.stages || [])) {
        if (s.created_at) months.add(s.created_at.substring(0, 7));
        if (s.updated_at) months.add(s.updated_at.substring(0, 7));
      }
    }
  }
  return months;
}

function _exportRoutineRow(task, ym, rows, rowMetas) {
  const rec = (task.records || []).find(function(r) { return r.year_month === ym; });
  if (rec) {
    rows.push([
      task.topic ? task.topic.name || '' : '',
      task.category ? task.category.name || '' : '',
      task.title,
      task.description || '',
      '-',
      '填报数量: ' + rec.quantity,
      this._fmtDate(task.created_at),
      this._monthFirstDay(ym),
      this._fmtDateTime(rec.filled_at),
      this._monthLastDay(ym),
      '-',
      '日常工作'
    ]);
    rowMetas.push({ taskId: task.id, status: task.status });
  }
}

function _exportStagesForMonth(task, ym, rows, allYearMonths, rowMetas) {
  const stages = task.stages || [];
  const totalStages = stages.length;
  const taskCompleted = task.status === 'completed' ? (task.completed_at || null) : null;
  const taskEndYm = taskCompleted ? taskCompleted.substring(0, 7) : null;

  if (stages.length === 0) {
    const createYm = task.created_at ? task.created_at.substring(0, 7) : null;
    if (createYm === ym) {
      rows.push([
        task.topic ? task.topic.name || '' : '',
        task.category ? task.category.name || '' : '',
        task.title,
        task.description || '',
        '-',
        '',
        this._fmtDate(task.created_at),
        this._fmtDate(task.started_at),
        '',
        this._fmtDate(task.completed_at),
        '0%',
        this._statusLabel(task.status)
      ]);
      rowMetas.push({ taskId: task.id, status: task.status });
    }
    return;
  }

  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    const stageCreatedYm = s.created_at ? s.created_at.substring(0, 7) : null;
    const stageUpdatedYm = s.updated_at ? s.updated_at.substring(0, 7) : stageCreatedYm;

    if (!stageCreatedYm) continue;
    if (ym < stageCreatedYm) continue;
    if (taskEndYm && ym > taskEndYm) continue;

    let effectiveNote = s.note || '';
    let effectiveUpdatedAt = s.updated_at || s.created_at;

    const isStageCreatedThisMonth = (stageCreatedYm === ym);
    const isStageUpdatedThisMonth = (stageUpdatedYm === ym) && (stageCreatedYm !== ym);

    if (!isStageCreatedThisMonth && !isStageUpdatedThisMonth) {
      const hasNewerStage = stages.some(function(ns, nj) {
        return nj > i && ns.created_at && ns.created_at.substring(0, 7) <= ym;
      });
      if (hasNewerStage) continue;

      if (ym > stageCreatedYm) {
        effectiveNote = '[跨月延续] ' + (s.note || '');
        if (taskCompleted) {
          effectiveUpdatedAt = task.completed_at;
        }
      }
    }

    const progress = this._stageProgress(i + 1, totalStages);

    rows.push([
      task.category ? task.category.name || '' : '',
      task.title,
      task.description || '',
      (i + 1) + '/' + totalStages + ' ' + (s.is_completed == 1 ? '✓' : '○'),
      effectiveNote,
      this._fmtDate(task.created_at),
      this._fmtDate(task.started_at),
      this._fmtDateTime(effectiveUpdatedAt),
      this._fmtDate(task.completed_at),
      progress + '%',
      this._statusLabel(task.status)
    ]);
    rowMetas.push({ taskId: task.id, status: task.status });
  }
}

// ---------- Monthly export ----------

function exportMonthly(dirPath, startMonth, endMonth) {
  const xlsx = require('xlsx-js-style');
  const path = require('path');
  const fs = require('fs');

  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
  const cats = this.db.getCategories();
  const topcs = this.db.getTopics();
  const topicMap = {};
  for (const t of topcs) topicMap[t.id] = t.name;
  const catTopicMap = {};
  for (const c of cats) catTopicMap[c.id] = topicMap[c.topic_id] || '';

  let ym = startMonth;
  while (ym <= endMonth) {
    const wb = xlsx.utils.book_new();
    let hasData = false;
    const allBlocks = [];

    for (var ci = 0; ci < cats.length; ci++) {
      var cat = cats[ci];
      const rows = [this._headerRow()];
      const rowMetas = [null];
      const topicName = catTopicMap[cat.id] || '';

      const tasks = this.db.getTasks(cat.id, ym);
      for (var ti = 0; ti < tasks.length; ti++) {
        var task = tasks[ti];
        if (task.is_routine) {
          if (task.routineRecord) {
            rows.push([
              topicName,
              cat.name,
              task.title,
              task.description || '',
              '-',
              '填报数量: ' + task.routineRecord.quantity,
              this._fmtDate(task.created_at),
              this._monthFirstDay(ym),
              this._fmtDateTime(task.routineRecord.filled_at),
              this._monthLastDay(ym),
              '-',
              '日常工作'
            ]);
            rowMetas.push({ taskId: task.id, status: task.status });
          }
        } else {
          const stages = task.stages || [];
          const totalStages = stages.length;

          if (stages.length === 0) {
            rows.push([
              topicName,
              cat.name,
              task.title,
              task.description || '',
              '-',
              '',
              this._fmtDate(task.created_at),
              this._fmtDate(task.started_at),
              '',
              this._fmtDate(task.completed_at),
              '0%',
              this._statusLabel(task.status)
            ]);
            rowMetas.push({ taskId: task.id, status: task.status });
          } else {
            for (var si = 0; si < stages.length; si++) {
              var s = stages[si];
              const stageCreatedYm = s.created_at ? s.created_at.substring(0, 7) : null;
              if (!stageCreatedYm) continue;
              if (ym < stageCreatedYm) continue;

              let effectiveNote = s.note || '';
              let effectiveUpdatedAt = s.updated_at || s.created_at;

              const isStageCreatedThisMonth = (stageCreatedYm === ym);
              var stageUpdatedYm = s.updated_at ? s.updated_at.substring(0, 7) : stageCreatedYm;
              const isStageUpdatedThisMonth = (stageUpdatedYm === ym) && (stageCreatedYm !== ym);

              if (!isStageCreatedThisMonth && !isStageUpdatedThisMonth) {
                var hasNewerStage = stages.some(function(ns, nj) {
                  return nj > si && ns.created_at && ns.created_at.substring(0, 7) <= ym;
                });
                if (hasNewerStage) continue;
                effectiveNote = '[跨月延续] ' + (s.note || '');
                if (task.status === 'completed' && task.completed_at) {
                  effectiveUpdatedAt = task.completed_at;
                }
              }

              const progress = this._stageProgress(si + 1, totalStages);

              rows.push([
                topicName,
                cat.name,
                task.title,
                task.description || '',
                (si + 1) + '/' + totalStages + ' ' + (s.is_completed == 1 ? '✓' : '○'),
                effectiveNote,
                this._fmtDate(task.created_at),
                this._fmtDate(task.started_at),
                this._fmtDateTime(effectiveUpdatedAt),
                this._fmtDate(task.completed_at),
                progress + '%',
                this._statusLabel(task.status)
              ]);
              rowMetas.push({ taskId: task.id, status: task.status });
            }
          }
        }
      }

      if (rows.length > 1) {
        const taskGroups = this._rowMetasToTaskGroups(rows, rowMetas);
        const ws = this._createStyledSheet(rows, taskGroups, rowMetas);
        xlsx.utils.book_append_sheet(wb, ws, cat.name);
        allBlocks.push({ rows: rows.slice(1), metas: rowMetas.slice(1), label: cat.name });
        hasData = true;
      }
    }

    if (allBlocks.length > 1) {
      const mergedRows = [this._headerRow()];
      const mergedMetas = [null];

      for (var bi = 0; bi < allBlocks.length; bi++) {
        var block = allBlocks[bi];
        var sepRow = ['── ' + block.label + ' ──', '', '', '', '', '', '', '', '', '', '', ''];
        mergedRows.push(sepRow);
        mergedMetas.push(null);

        for (var bri = 0; bri < block.rows.length; bri++) {
          mergedRows.push(block.rows[bri]);
          mergedMetas.push(block.metas[bri]);
        }
      }

      const mergedGroups = this._rowMetasToTaskGroups(mergedRows, mergedMetas);
      const wsMerged = this._createStyledSheet(mergedRows, mergedGroups, mergedMetas);
      xlsx.utils.book_append_sheet(wb, wsMerged, '融合任务');
    }

    if (hasData) {
      var filePath = path.join(dirPath, '工单台账_' + ym + '.xlsx');
      xlsx.writeFile(wb, filePath);
    }

    var ymParts = ym.split('-').map(Number);
    var nextM = ymParts[1] === 12 ? 1 : ymParts[1] + 1;
    var nextY = ymParts[1] === 12 ? ymParts[0] + 1 : ymParts[0];
    ym = nextY + '-' + String(nextM).padStart(2, '0');
  }
}

module.exports = {
  exportToExcel,
  exportMonthly,
  _collectYearMonths,
  _exportRoutineRow,
  _exportStagesForMonth
};
