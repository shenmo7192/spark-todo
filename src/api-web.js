(function() {
  const db = new IndexedDBStorage();

  const APP_VERSION = '1.1.0';
  const DB_SCHEMA_VERSION = '1';

  function _fmtDate(d) {
    if (!d) return '';
    const date = new Date(d.replace(/-/g, '/'));
    if (isNaN(date.getTime())) {
      const m = d.match(/^(\d{4}-\d{2}-\d{2})/);
      return m ? m[1] : d.substring(0, 10);
    }
    const y = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
  }

  function _fmtDateTime(d) {
    if (!d) return '';
    const date = new Date(d.replace(/-/g, '/'));
    if (isNaN(date.getTime())) {
      const m = d.match(/^(\d{4}-\d{2}-\d{2})/);
      return m ? m[1] : d.substring(0, 16);
    }
    const y = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    return `${y}-${mo}-${day} ${h}:${mi}`;
  }

  function _statusLabel(status) {
    const map = { created: '已创建', in_progress: '进行中', completed: '已完成' };
    return map[status] || status;
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

  function _exportHeaderRow() {
    return [
      '分类', '任务名称', '文本描述', '第几段', '阶段备注（更新内容）',
      '接收时间', '开始时间', '更新时间', '结束时间',
      '完成度', '状态'
    ];
  }

  function _exportColumnWidths() {
    return [
      { wch: 10 }, { wch: 20 }, { wch: 30 }, { wch: 12 }, { wch: 35 },
      { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 10 }, { wch: 10 }
    ];
  }

  function _exportRoutineRow(task, ym, rows) {
    const rec = (task.records || []).find(r => r.year_month === ym);
    if (rec) {
      rows.push([
        task.category?.name || '',
        task.title,
        task.description || '',
        '-',
        `填报数量: ${rec.quantity}`,
        _fmtDate(task.created_at),
        '-',
        _fmtDateTime(rec.filled_at),
        '-',
        '-',
        '日常工作'
      ]);
    }
  }

  function _exportStagesForMonth(task, ym, rows, allYearMonths) {
    const stages = task.stages || [];
    const taskCompleted = task.status === 'completed' ? (task.completed_at || null) : null;
    const taskEndYm = taskCompleted ? taskCompleted.substring(0, 7) : null;

    if (stages.length === 0) {
      const createYm = task.created_at ? task.created_at.substring(0, 7) : null;
      if (createYm === ym) {
        rows.push([
          task.category?.name || '',
          task.title,
          task.description || '',
          '-',
          '',
          _fmtDate(task.created_at),
          _fmtDate(task.started_at),
          '',
          _fmtDate(task.completed_at),
          '0%',
          _statusLabel(task.status)
        ]);
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
        const hasNewerStage = stages.some((ns, nj) =>
          nj > i && ns.created_at && ns.created_at.substring(0, 7) <= ym
        );
        if (hasNewerStage) continue;

        if (ym > stageCreatedYm) {
          effectiveNote = `[跨月延续] ${s.note || ''}`;
          if (taskCompleted) {
            effectiveNote += ' (任务已完成)';
          }
        }
      } else if (isStageUpdatedThisMonth) {
        effectiveNote = s.note || '更新状态';
      }

      const totalStages = stages.length;
      const progress = totalStages > 0
        ? Math.round(((i + 1) / totalStages) * 100)
        : 0;

      rows.push([
        task.category?.name || '',
        task.title,
        task.description || '',
        `第${s.stage_index}段`,
        effectiveNote,
        _fmtDate(task.created_at),
        _fmtDate(task.started_at),
        _fmtDateTime(effectiveUpdatedAt),
        _fmtDate(task.completed_at),
        progress + '%',
        _statusLabel(task.status)
      ]);
    }
  }

  async function exportToExcel() {
    const tasks = await db.getExportData();
    const yearMonths = _collectYearMonths(tasks);
    const sortedMonths = Array.from(yearMonths).filter(Boolean).sort();

    const wb = XLSX.utils.book_new();

    if (sortedMonths.length === 0) {
      const ws = XLSX.utils.aoa_to_sheet([['暂无数据']]);
      XLSX.utils.book_append_sheet(wb, ws, '无数据');
    }

    for (const ym of sortedMonths) {
      const rows = [_exportHeaderRow()];

      for (const task of tasks) {
        if (task.is_routine) {
          _exportRoutineRow(task, ym, rows);
        } else {
          _exportStagesForMonth(task, ym, rows, sortedMonths);
        }
      }

      if (rows.length > 1) {
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = _exportColumnWidths();
        XLSX.utils.book_append_sheet(wb, ws, ym);
      }
    }

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `台账_${new Date().toISOString().substring(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function exportExcelDB() {
    const data = await db.exportAllData();
    const exportPayload = {
      version: APP_VERSION,
      db_schema_version: DB_SCHEMA_VERSION,
      exported_at: new Date().toISOString(),
      app_name: 'Spark Todo',
      data: data
    };

    const wb = XLSX.utils.book_new();

    if (exportPayload.data.meta) {
      const metaWithVersion = [...exportPayload.data.meta];
      metaWithVersion.push({ key: 'app_version', value: APP_VERSION });
      metaWithVersion.push({ key: 'db_schema_version', value: DB_SCHEMA_VERSION });
      metaWithVersion.push({ key: 'exported_at', value: exportPayload.exported_at });
      metaWithVersion.push({ key: 'app_name', value: 'Spark Todo' });
      const wsMeta = XLSX.utils.json_to_sheet(metaWithVersion);
      XLSX.utils.book_append_sheet(wb, wsMeta, 'meta');
    }

    const arraySheets = ['categories', 'tasks', 'stages', 'routine_records'];
    for (const name of arraySheets) {
      if (exportPayload.data[name] && exportPayload.data[name].length > 0) {
        const ws = XLSX.utils.json_to_sheet(exportPayload.data[name]);
        XLSX.utils.book_append_sheet(wb, ws, name);
      }
    }

    if (exportPayload.data.carry_overs && exportPayload.data.carry_overs.length > 0) {
      const ws = XLSX.utils.json_to_sheet(exportPayload.data.carry_overs);
      XLSX.utils.book_append_sheet(wb, ws, 'carry_overs');
    }

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SparkTodo_备份_${new Date().toISOString().substring(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return { success: true };
  }

  async function importExcelDB(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          const data = new Uint8Array(e.target.result);
          const wb = XLSX.read(data, { type: 'array' });

          const metaSheet = wb.Sheets['meta'];
          let metaRows = [];
          if (metaSheet) {
            metaRows = XLSX.utils.sheet_to_json(metaSheet);
          }

          let fileVersion = '1.0.0';
          let fileSchemaVersion = '1';
          const metaMap = {};
          for (const row of metaRows) {
            if (row.key) metaMap[row.key] = row.value;
          }
          if (metaMap['app_version']) fileVersion = metaMap['app_version'];
          if (metaMap['db_schema_version']) fileSchemaVersion = metaMap['db_schema_version'];
          if (!metaMap['app_version'] && !metaMap['db_schema_version']) {
            fileVersion = '1.0.0';
            fileSchemaVersion = '1';
          }

          const importedData = { meta: metaRows };

          const sheetNames = ['categories', 'tasks', 'stages', 'routine_records', 'carry_overs'];
          for (const name of sheetNames) {
            const sheet = wb.Sheets[name];
            if (sheet) {
              importedData[name] = XLSX.utils.sheet_to_json(sheet);
            }
          }

          importedData.meta = metaRows.filter(r => !['app_version', 'db_schema_version', 'exported_at', 'app_name'].includes(r.key));

          resolve({
            data: importedData,
            version: fileVersion,
            schemaVersion: fileSchemaVersion
          });
        } catch (err) {
          reject(new Error('文件解析失败: ' + err.message));
        }
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsArrayBuffer(file);
    });
  }

  async function exportMonthly(dirName, startMonth, endMonth) {
    const tasks = await db.getExportData();

    const yearMonths = _collectYearMonths(tasks);
    const sortedMonths = Array.from(yearMonths).filter(Boolean).sort();

    const filtered = sortedMonths.filter(ym => ym >= startMonth && ym <= endMonth);

    if (filtered.length === 0) {
      return { success: false, error: '所选月份范围内无数据' };
    }

    let fileCount = 0;
    for (const ym of filtered) {
      const rows = [_exportHeaderRow()];
      for (const task of tasks) {
        if (task.is_routine) {
          _exportRoutineRow(task, ym, rows);
        } else {
          _exportStagesForMonth(task, ym, rows, sortedMonths);
        }
      }

      if (rows.length > 1) {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = _exportColumnWidths();
        XLSX.utils.book_append_sheet(wb, ws, ym);

        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${dirName || '台账'}_${ym}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        fileCount++;

        await new Promise(r => setTimeout(r, 500));
      }
    }

    return { success: true, fileCount };
  }

  window.electronAPI = {
    getCategories: () => db.ready.then(() => db.getCategories()),
    addCategory: (name, isRoutine) => db.ready.then(() => db.addCategory(name, isRoutine)),
    updateCategory: (id, name, isRoutine) => db.ready.then(() => db.updateCategory(id, name, isRoutine)),
    moveCategory: (id, direction) => db.ready.then(() => db.moveCategory(id, direction)),
    deleteCategory: (id) => db.ready.then(() => db.deleteCategory(id)),

    getTasks: (categoryId, yearMonth) => db.ready.then(() => db.getTasks(categoryId, yearMonth)),
    getTaskById: (taskId) => db.ready.then(() => db.getTaskById(taskId)),
    addTask: (task) => db.ready.then(() => db.addTask(task)),
    updateTask: (task) => db.ready.then(() => db.updateTask(task)),
    deleteTask: (id) => db.ready.then(() => db.deleteTask(id)),

    getStages: (taskId) => db.ready.then(() => db.getStages(taskId)),
    addStage: (stage) => db.ready.then(() => db.addStage(stage)),
    updateStage: (stage) => db.ready.then(() => db.updateStage(stage)),
    deleteStage: (stageId) => db.ready.then(() => db.deleteStage(stageId)),

    getRoutineRecord: (taskId, yearMonth) => db.ready.then(() => db.getRoutineRecord(taskId, yearMonth)),
    fillRoutine: (record) => db.ready.then(() => db.fillRoutine(record)),
    getLastMonthRoutine: (taskId, yearMonth) => db.ready.then(() => db.getLastMonthRoutine(taskId, yearMonth)),
    checkRoutineUnfilled: (categoryId, yearMonth) => db.ready.then(() => db.checkRoutineUnfilled(categoryId, yearMonth)),

    getAllActiveMonths: () => db.ready.then(() => db.getAllActiveMonths()),
    carryOverTasks: (targetYearMonth, categoryId) => db.ready.then(() => db.carryOverTasks(targetYearMonth, categoryId)),
    getAllTasksByYear: (year) => db.ready.then(() => db.getAllTasksByYear(year)),
    batchReorderTasks: (categoryId, taskIds) => db.ready.then(() => db.batchReorderTasks(categoryId, taskIds)),
    changeTaskCategory: (taskId, newCategoryId) => db.ready.then(() => db.changeTaskCategory(taskId, newCategoryId)),
    bulkChangeTaskCategory: (taskIds, newCategoryId) => db.ready.then(() => db.bulkChangeTaskCategory(taskIds, newCategoryId)),

    exportExcel: () => db.ready.then(() => exportToExcel()),

    showSaveDialog: () => Promise.resolve({ filePath: null }),
    showOpenDialog: () => Promise.resolve({ canceled: true, filePaths: [] }),

    exportMonthly: (dirName, startMonth, endMonth) => db.ready.then(() => exportMonthly(dirName, startMonth, endMonth)),

    exportExcelDB: () => db.ready.then(() => exportExcelDB()),
    importExcelDB: (file) => db.ready.then(() => importExcelDB(file)),

    importData: (data, mode) => db.ready.then(() => db.importAllData(data, mode)),

    getVersion: () => Promise.resolve(APP_VERSION),
    getDbSchemaVersion: () => Promise.resolve(DB_SCHEMA_VERSION)
  };
})();
