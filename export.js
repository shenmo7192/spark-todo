const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

class Exporter {
  constructor(db) {
    this.db = db;
  }

  _fmtDate(d) {
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

  _fmtDateTime(d) {
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

  _stageProgress(stageIndex, totalStages) {
    if (totalStages <= 0) return 0;
    return Math.round((stageIndex / totalStages) * 100);
  }

  _statusLabel(status) {
    const map = { created: '已创建', in_progress: '进行中', completed: '已完成' };
    return map[status] || status;
  }

  _headerRow() {
    return [
      '分类', '任务名称', '文本描述', '第几段', '阶段备注（更新内容）',
      '接收时间', '开始时间', '更新时间', '结束时间',
      '完成度', '状态'
    ];
  }

  _columnWidths() {
    return [
      { wch: 10 },  // 分类
      { wch: 20 },  // 任务名称
      { wch: 30 },  // 文本描述
      { wch: 12 },  // 第几段
      { wch: 35 },  // 阶段备注
      { wch: 18 },  // 接收时间
      { wch: 18 },  // 开始时间
      { wch: 18 },  // 更新时间
      { wch: 18 },  // 结束时间
      { wch: 10 },  // 完成度
      { wch: 10 },  // 状态
    ];
  }

  _styleSheet(ws) {
    ws['!cols'] = this._columnWidths();
    return ws;
  }

  async exportToExcel(targetPath) {
    const tasks = this.db.getExportData();
    const wb = xlsx.utils.book_new();

    const yearMonths = this._collectYearMonths(tasks);
    const sortedMonths = Array.from(yearMonths).filter(Boolean).sort();

    if (sortedMonths.length === 0) {
      const ws = xlsx.utils.aoa_to_sheet([['暂无数据']]);
      xlsx.utils.book_append_sheet(wb, ws, '无数据');
    }

    for (const ym of sortedMonths) {
      const rows = [this._headerRow()];

      for (const task of tasks) {
        if (task.is_routine) {
          this._exportRoutineRow(task, ym, rows);
        } else {
          this._exportStagesForMonth(task, ym, rows, sortedMonths);
        }
      }

      if (rows.length > 1) {
        const ws = this._styleSheet(xlsx.utils.aoa_to_sheet(rows));
        xlsx.utils.book_append_sheet(wb, ws, ym);
      }
    }

    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    xlsx.writeFile(wb, targetPath);
    return targetPath;
  }

  _collectYearMonths(tasks) {
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

  _exportRoutineRow(task, ym, rows) {
    const rec = (task.records || []).find(r => r.year_month === ym);
    if (rec) {
      rows.push([
        task.category?.name || '',
        task.title,
        task.description || '',
        '-',
        `填报数量: ${rec.quantity}`,
        this._fmtDate(task.created_at),
        '-',
        this._fmtDateTime(rec.filled_at),
        '-',
        '-',
        '日常工作'
      ]);
    }
  }

  _exportStagesForMonth(task, ym, rows, allYearMonths) {
    const stages = task.stages || [];
    const totalStages = stages.length;
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
          this._fmtDate(task.created_at),
          this._fmtDate(task.started_at),
          '',
          this._fmtDate(task.completed_at),
          '0%',
          this._statusLabel(task.status)
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
            effectiveUpdatedAt = task.completed_at;
          }
        }
      }

      const progress = this._stageProgress(i + 1, totalStages);

      rows.push([
        task.category?.name || '',
        task.title,
        task.description || '',
        `${i + 1}/${totalStages}`,
        effectiveNote,
        this._fmtDate(task.created_at),
        this._fmtDate(task.started_at),
        this._fmtDateTime(effectiveUpdatedAt),
        this._fmtDate(task.completed_at),
        `${progress}%`,
        this._statusLabel(task.status)
      ]);
    }
  }

  _findMonthIndex(ym, sortedMonths) {
    return sortedMonths.indexOf(ym);
  }

  async exportMonthly(dirPath, startMonth, endMonth) {
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
    const cats = this.db.getCategories();

    let ym = startMonth;
    while (ym <= endMonth) {
      const wb = xlsx.utils.book_new();
      let hasData = false;

      for (const cat of cats) {
        const rows = [this._headerRow()];

        const tasks = this.db.getTasks(cat.id, ym);
        for (const task of tasks) {
          if (task.is_routine) {
            if (task.routineRecord) {
              rows.push([
                cat.name,
                task.title,
                task.description || '',
                '-',
                `填报数量: ${task.routineRecord.quantity}`,
                this._fmtDate(task.created_at),
                '-',
                this._fmtDateTime(task.routineRecord.filled_at),
                '-',
                '-',
                '日常工作'
              ]);
            }
          } else {
            const stages = task.stages || [];
            const totalStages = stages.length;

            if (stages.length === 0) {
              rows.push([
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
            } else {
              for (let i = 0; i < stages.length; i++) {
                const s = stages[i];
                const stageCreatedYm = s.created_at ? s.created_at.substring(0, 7) : null;
                if (!stageCreatedYm) continue;
                if (ym < stageCreatedYm) continue;

                let effectiveNote = s.note || '';
                let effectiveUpdatedAt = s.updated_at || s.created_at;

                const isStageCreatedThisMonth = (stageCreatedYm === ym);
                const stageUpdatedYm = s.updated_at ? s.updated_at.substring(0, 7) : stageCreatedYm;
                const isStageUpdatedThisMonth = (stageUpdatedYm === ym) && (stageCreatedYm !== ym);

                if (!isStageCreatedThisMonth && !isStageUpdatedThisMonth) {
                  const hasNewerStage = stages.some((ns, nj) =>
                    nj > i && ns.created_at && ns.created_at.substring(0, 7) <= ym
                  );
                  if (hasNewerStage) continue;
                  effectiveNote = `[跨月延续] ${s.note || ''}`;
                  if (task.status === 'completed' && task.completed_at) {
                    effectiveUpdatedAt = task.completed_at;
                  }
                }

                const progress = this._stageProgress(i + 1, totalStages);

                rows.push([
                  cat.name,
                  task.title,
                  task.description || '',
                  `${i + 1}/${totalStages}`,
                  effectiveNote,
                  this._fmtDate(task.created_at),
                  this._fmtDate(task.started_at),
                  this._fmtDateTime(effectiveUpdatedAt),
                  this._fmtDate(task.completed_at),
                  `${progress}%`,
                  this._statusLabel(task.status)
                ]);
              }
            }
          }
        }

        if (rows.length > 1) {
          const ws = this._styleSheet(xlsx.utils.aoa_to_sheet(rows));
          xlsx.utils.book_append_sheet(wb, ws, cat.name);
          hasData = true;
        }
      }

      if (hasData) {
        const filePath = path.join(dirPath, `工单台账_${ym}.xlsx`);
        xlsx.writeFile(wb, filePath);
      }

      const [y, m] = ym.split('-').map(Number);
      const nextM = m === 12 ? 1 : m + 1;
      const nextY = m === 12 ? y + 1 : y;
      ym = `${nextY}-${String(nextM).padStart(2, '0')}`;
    }
  }

  static _readImportFile(filePath) {
    const buffer = fs.readFileSync(filePath);
    const wb = xlsx.read(buffer, { type: 'buffer' });

    const result = {};

    const metaSheet = wb.Sheets['meta'];
    if (metaSheet) {
      result.meta = xlsx.utils.sheet_to_json(metaSheet);
    } else {
      result.meta = [];
    }

    const sheetNames = ['categories', 'tasks', 'stages', 'routine_records', 'carry_overs'];
    for (const name of sheetNames) {
      const sheet = wb.Sheets[name];
      if (sheet) {
        result[name] = xlsx.utils.sheet_to_json(sheet);
      } else {
        result[name] = [];
      }
    }

    return result;
  }

  static parseImportVersion(data) {
    let version = '1.0.0';
    let schemaVersion = '1';

    if (data.meta) {
      for (const row of data.meta) {
        if (row.key === 'app_version') version = row.value || '1.0.0';
        if (row.key === 'db_schema_version') schemaVersion = String(row.value || '1');
      }
    }

    return { version, schemaVersion };
  }

  exportExcelDB(targetPath) {
    const APP_VERSION = '1.1.0';
    const DB_SCHEMA_VERSION = '1';

    const allCategories = this.db._sheetToJson('categories');
    const allTasks = this.db._sheetToJson('tasks');
    const allStages = this.db._sheetToJson('stages');
    const allRoutines = this.db._sheetToJson('routine_records');
    const allCarries = this.db._sheetToJson('carry_overs');
    const allMeta = this.db._sheetToJson('meta');

    const metaWithVersion = [...allMeta];
    const versionKeys = ['app_version', 'db_schema_version', 'exported_at', 'app_name'];
    const filteredMeta = metaWithVersion.filter(r => !versionKeys.includes(r[0]));
    filteredMeta.push(['app_version', APP_VERSION]);
    filteredMeta.push(['db_schema_version', DB_SCHEMA_VERSION]);
    filteredMeta.push(['exported_at', new Date().toISOString()]);
    filteredMeta.push(['app_name', 'Spark Todo']);

    const wb = xlsx.utils.book_new();

    const wsMeta = xlsx.utils.aoa_to_sheet([['key', 'value'], ...filteredMeta]);
    xlsx.utils.book_append_sheet(wb, wsMeta, 'meta');

    const arraySheets = [
      { name: 'categories', headers: ['id', 'name', 'is_routine', 'sort_order', 'created_at'], data: allCategories },
      { name: 'tasks', headers: ['id', 'category_id', 'title', 'description', 'status', 'progress', 'is_routine', 'created_at', 'started_at', 'completed_at', 'sort_order'], data: allTasks },
      { name: 'stages', headers: ['id', 'task_id', 'stage_index', 'note', 'progress_value', 'created_at', 'updated_at', 'is_completed'], data: allStages },
      { name: 'routine_records', headers: ['id', 'task_id', 'year_month', 'quantity', 'filled_at'], data: allRoutines }
    ];

    for (const sheet of arraySheets) {
      if (sheet.data.length > 0) {
        const ws = xlsx.utils.aoa_to_sheet([sheet.headers, ...sheet.data]);
        xlsx.utils.book_append_sheet(wb, ws, sheet.name);
      } else {
        const ws = xlsx.utils.aoa_to_sheet([sheet.headers]);
        xlsx.utils.book_append_sheet(wb, ws, sheet.name);
      }
    }

    if (allCarries.length > 0) {
      const ws = xlsx.utils.aoa_to_sheet([['task_id', 'year_month', 'carried_at'], ...allCarries]);
      xlsx.utils.book_append_sheet(wb, ws, 'carry_overs');
    } else {
      const ws = xlsx.utils.aoa_to_sheet([['task_id', 'year_month', 'carried_at']]);
      xlsx.utils.book_append_sheet(wb, ws, 'carry_overs');
    }

    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    xlsx.writeFile(wb, targetPath);
    return targetPath;
  }

  importExcelDBRaw(data, mode) {
    const { version, schemaVersion } = Exporter.parseImportVersion(data);

    if (schemaVersion !== '1') {
      return { success: false, error: `数据架构版本不兼容：文件为 v${schemaVersion}，当前支持 v1` };
    }

    if (mode === 'replace') {
      for (const name of ['categories', 'tasks', 'stages', 'routine_records', 'carry_overs']) {
        const sheetName = name;
        const headers = {
          categories: ['id', 'name', 'is_routine', 'sort_order', 'created_at'],
          tasks: ['id', 'category_id', 'title', 'description', 'status', 'progress', 'is_routine', 'created_at', 'started_at', 'completed_at', 'sort_order'],
          stages: ['id', 'task_id', 'stage_index', 'note', 'progress_value', 'created_at', 'updated_at', 'is_completed'],
          routine_records: ['id', 'task_id', 'year_month', 'quantity', 'filled_at'],
          carry_overs: ['task_id', 'year_month', 'carried_at']
        }[name];

        if (data[name] && data[name].length > 0) {
          const rows = data[name].map(row => {
            const arr = [];
            for (const h of headers) {
              arr.push(row[h] !== undefined ? row[h] : '');
            }
            return arr;
          });
          this.db._replaceSheet(sheetName, rows);
        } else {
          this.db._replaceSheet(sheetName, []);
        }
      }

      const versionKeys = ['app_version', 'db_schema_version', 'exported_at', 'app_name'];
      const cleanMeta = (data.meta || []).filter(r => !versionKeys.includes(r.key));
      this.db._replaceSheet('meta', cleanMeta.map(r => [r.key, r.value]));
    } else if (mode === 'merge') {
      for (const name of ['categories', 'tasks', 'stages', 'routine_records']) {
        if (data[name] && data[name].length > 0) {
          const existing = this.db._sheetToJson(name);
          const existingIds = new Set(existing.map(r => r[0]));
          const newRows = [];
          for (const item of data[name]) {
            if (!existingIds.has(item.id)) {
              const headers = {
                categories: ['id', 'name', 'is_routine', 'sort_order', 'created_at'],
                tasks: ['id', 'category_id', 'title', 'description', 'status', 'progress', 'is_routine', 'created_at', 'started_at', 'completed_at', 'sort_order'],
                stages: ['id', 'task_id', 'stage_index', 'note', 'progress_value', 'created_at', 'updated_at', 'is_completed'],
                routine_records: ['id', 'task_id', 'year_month', 'quantity', 'filled_at']
              }[name];
              const arr = headers.map(h => item[h] !== undefined ? item[h] : '');
              newRows.push(arr);
            }
          }
          if (newRows.length > 0) {
            for (const row of newRows) {
              this.db._appendRows(name, [row]);
            }
          }
        }
      }

      if (data['carry_overs'] && data['carry_overs'].length > 0) {
        const existing = this.db._sheetToJson('carry_overs');
        const existingSet = new Set(existing.map(r => `${r[0]}|${r[1]}`));
        for (const item of data['carry_overs']) {
          const key = `${item.task_id}|${item.year_month}`;
          if (!existingSet.has(key)) {
            this.db._appendRows('carry_overs', [[item.task_id, item.year_month, item.carried_at]]);
          }
        }
      }

      const versionKeys = ['app_version', 'db_schema_version', 'exported_at', 'app_name'];
      const cleanMeta = (data.meta || []).filter(r => !versionKeys.includes(r.key));
      const existingMeta = this.db._sheetToJson('meta');
      const metaMap = {};
      for (const m of existingMeta) metaMap[m[0]] = parseInt(m[1]) || 0;
      for (const m of cleanMeta) {
        if (m.key && m.key.startsWith('last_') && metaMap[m.key] !== undefined) {
          metaMap[m.key] = Math.max(metaMap[m.key], parseInt(m.value) || 0);
        } else if (!metaMap[m.key]) {
          metaMap[m.key] = m.value;
        }
      }
      const mergedMeta = Object.entries(metaMap).map(([k, v]) => [k, v]);
      this.db._replaceSheet('meta', mergedMeta);
    }

    this.db.save();
    return { success: true, version, schemaVersion };
  }

  importExcelDB(filePath, mode) {
    const data = Exporter._readImportFile(filePath);
    return this.importExcelDBRaw(data, mode);
  }
}

module.exports = Exporter;
