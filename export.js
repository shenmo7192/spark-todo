const xlsx = require('xlsx-js-style');
const path = require('path');
const fs = require('fs');

const COL_COUNT = 12;

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
      '专题', '分类', '任务名称', '文本描述', '第几段', '阶段备注（更新内容）',
      '接收时间', '开始时间', '更新时间', '结束时间',
      '完成度', '状态'
    ];
  }

  _columnWidths() {
    return [
      { wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 30 }, { wch: 12 }, { wch: 35 },
      { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 10 },
      { wch: 10 }
    ];
  }

  // ---------- Styling helpers ----------

  _thinBorder() {
    return { style: 'thin', color: { rgb: '000000' } };
  }

  _mediumBorder() {
    return { style: 'medium', color: { rgb: '000000' } };
  }

  _statusBgColor(statusLabel) {
    if (statusLabel === '已创建') return 'FFC7CE';
    if (statusLabel === '进行中') return 'FFE211';
    if (statusLabel === '已完成') return '39C5BB';
    if (statusLabel === '日常工作') return '66CCFF';
    return null;
  }

  _rowMetasToTaskGroups(rows, rowMetas) {
    const groups = [];
    let i = 1; // skip header row (index 0)
    while (i < rowMetas.length) {
      const meta = rowMetas[i];
      if (!meta || !meta.taskId) { i++; continue; }
      let end = i;
      while (end + 1 < rowMetas.length &&
             rowMetas[end + 1] &&
             rowMetas[end + 1].taskId === meta.taskId &&
             rows[end + 1][10] !== '日常工作') {
        end++;
      }
      groups.push({ startRow: i, endRow: end, taskId: meta.taskId, status: meta.status });
      i = end + 1;
    }
    return groups;
  }

  _createStyledSheet(rows, taskGroups, rowMetas) {
    const lastDataRow = rows.length - 1;
    const lastCol = COL_COUNT - 1;

    // Build sheet with cell objects
    const ws = {};
    ws['!ref'] = xlsx.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastDataRow, c: lastCol } });
    ws['!cols'] = this._columnWidths();

    // Row heights
    const rowHeights = [{ hpx: 24 }]; // header
    for (let r = 1; r <= lastDataRow; r++) rowHeights.push({ hpx: 40 });
    ws['!rows'] = rowHeights;

    // Build every cell as a styled object
    for (let R = 0; R < rows.length; R++) {
      for (let C = 0; C < COL_COUNT; C++) {
        const addr = xlsx.utils.encode_cell({ r: R, c: C });
        const rawVal = rows[R][C] !== undefined ? rows[R][C] : '';
        const cell = { v: rawVal, t: 's' };

        // Determine status for this row
        const statusLabel = rows[R][10] || '';

        // Alignment
        cell.s = {
          alignment: { vertical: 'center', wrapText: true }
        };

        // Header styling
        if (R === 0) {
          cell.s.font = { bold: true, sz: 12 };
          cell.s.fill = { patternType: 'solid', fgColor: { rgb: 'D9E1F2' } };
          cell.s.alignment.horizontal = 'center';
        } else {
          // Data row background
          const bg = this._statusBgColor(statusLabel);
          if (bg) {
            cell.s.fill = { patternType: 'solid', fgColor: { rgb: bg } };
          }
        }

        // Thin border on every cell
        cell.s.border = {
          top: this._thinBorder(),
          bottom: this._thinBorder(),
          left: this._thinBorder(),
          right: this._thinBorder()
        };

        ws[addr] = cell;
      }
    }

    // Apply task group merges & bold border
    const merges = [];
    const mediumB = this._mediumBorder();

    for (const g of taskGroups) {
      if (g.endRow > g.startRow) {
        // Merge 分类 (col 0), 任务名称 (col 1), 文本描述 (col 2)
        for (const col of [0, 1, 2]) {
          merges.push({ s: { r: g.startRow, c: col }, e: { r: g.endRow, c: col } });
        }
      }

      // Center vertically for merged cols
      for (let R = g.startRow; R <= g.endRow; R++) {
        for (let C = 0; C <= 2; C++) {
          const addr = xlsx.utils.encode_cell({ r: R, c: C });
          if (ws[addr]) {
            ws[addr].s.alignment.vertical = 'center';
            if (C === 1) ws[addr].s.alignment.horizontal = 'center';
          }
        }
      }
    }

    ws['!merges'] = merges;

    // Outer table border (medium)
    for (let R = 0; R <= lastDataRow; R++) {
      const lAddr = xlsx.utils.encode_cell({ r: R, c: 0 });
      const rAddr = xlsx.utils.encode_cell({ r: R, c: lastCol });
      if (ws[lAddr]) ws[lAddr].s.border.left = mediumB;
      if (ws[rAddr]) ws[rAddr].s.border.right = mediumB;
    }
    for (let C = 0; C <= lastCol; C++) {
      const tAddr = xlsx.utils.encode_cell({ r: 0, c: C });
      const bAddr = xlsx.utils.encode_cell({ r: lastDataRow, c: C });
      if (ws[tAddr]) ws[tAddr].s.border.top = mediumB;
      if (ws[bAddr]) ws[bAddr].s.border.bottom = mediumB;
    }

    // Task group bold border around merged region (cols 0-2)
    for (const g of taskGroups) {
      for (let R = g.startRow; R <= g.endRow; R++) {
        for (let C = 0; C <= 2; C++) {
          const addr = xlsx.utils.encode_cell({ r: R, c: C });
          if (!ws[addr]) continue;
          if (R === g.startRow) ws[addr].s.border.top = mediumB;
          if (R === g.endRow) ws[addr].s.border.bottom = mediumB;
          if (C === 0) ws[addr].s.border.left = mediumB;
          if (C === 2) ws[addr].s.border.right = mediumB;
        }
      }
    }

    return ws;
  }

  // ---------- Export methods ----------

  async exportToExcel(targetPath, fromMonth, toMonth) {
    const tasks = this.db.getExportData();
    const wb = xlsx.utils.book_new();

    const yearMonths = this._collectYearMonths(tasks);
    let sortedMonths = Array.from(yearMonths).filter(Boolean).sort();

    // Filter by date range if provided
    if (fromMonth && toMonth) {
      sortedMonths = sortedMonths.filter(ym => ym >= fromMonth && ym <= toMonth);
    }

    if (sortedMonths.length === 0) {
      const ws = xlsx.utils.aoa_to_sheet([['暂无数据']]);
      xlsx.utils.book_append_sheet(wb, ws, '无数据');
    }

    // Collect data for fusion sheet
    const allBlocks = [];

    for (const ym of sortedMonths) {
      const rows = [this._headerRow()];
      const rowMetas = [null]; // header has no meta

      for (const task of tasks) {
        if (task.is_routine) {
          this._exportRoutineRow(task, ym, rows, rowMetas);
        } else {
          this._exportStagesForMonth(task, ym, rows, sortedMonths, rowMetas);
        }
      }

      if (rows.length > 1) {
        const taskGroups = this._rowMetasToTaskGroups(rows, rowMetas);
        const ws = this._createStyledSheet(rows, taskGroups, rowMetas);
        xlsx.utils.book_append_sheet(wb, ws, ym);
        allBlocks.push({ rows: rows.slice(1), metas: rowMetas.slice(1), ym });
      }
    }

    // Build 融合任务 sheet
    if (allBlocks.length > 0) {
      const mergedRows = [this._headerRow()];
      const mergedMetas = [null];

      for (let bi = 0; bi < allBlocks.length; bi++) {
        const block = allBlocks[bi];
        // Separator row between months
        if (bi > 0) {
          const sepRow = [`── ${block.ym} ──`, '', '', '', '', '', '', '', '', '', '', ''];
          mergedRows.push(sepRow);
          mergedMetas.push(null);
        } else {
          // First block: add its ym as a sub-label
          const labelRow = [`── ${block.ym} ──`, '', '', '', '', '', '', '', '', '', '', ''];
          mergedRows.push(labelRow);
          mergedMetas.push(null);
        }

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

  _exportRoutineRow(task, ym, rows, rowMetas) {
    const rec = (task.records || []).find(r => r.year_month === ym);
    if (rec) {
      rows.push([
        task.topic?.name || '',
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
      rowMetas.push({ taskId: task.id, status: task.status });
    }
  }

  _exportStagesForMonth(task, ym, rows, allYearMonths, rowMetas) {
    const stages = task.stages || [];
    const totalStages = stages.length;
    const taskCompleted = task.status === 'completed' ? (task.completed_at || null) : null;
    const taskEndYm = taskCompleted ? taskCompleted.substring(0, 7) : null;

    if (stages.length === 0) {
      const createYm = task.created_at ? task.created_at.substring(0, 7) : null;
      if (createYm === ym) {
        rows.push([
          task.topic?.name || '',
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
        `${i + 1}/${totalStages} ` + (s.is_completed == 1 ? '✓' : '○'),
        effectiveNote,
        this._fmtDate(task.created_at),
        this._fmtDate(task.started_at),
        this._fmtDateTime(effectiveUpdatedAt),
        this._fmtDate(task.completed_at),
        `${progress}%`,
        this._statusLabel(task.status)
      ]);
      rowMetas.push({ taskId: task.id, status: task.status });
    }
  }

  // ---------- Monthly export ----------

  async exportMonthly(dirPath, startMonth, endMonth) {
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

      for (const cat of cats) {
        const rows = [this._headerRow()];
        const rowMetas = [null];
        const topicName = catTopicMap[cat.id] || '';

        const tasks = this.db.getTasks(cat.id, ym);
        for (const task of tasks) {
          if (task.is_routine) {
            if (task.routineRecord) {
              rows.push([
                topicName,
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
                  topicName,
                  cat.name,
                  task.title,
                  task.description || '',
                  `${i + 1}/${totalStages} ` + (s.is_completed == 1 ? '✓' : '○'),
                  effectiveNote,
                  this._fmtDate(task.created_at),
                  this._fmtDate(task.started_at),
                  this._fmtDateTime(effectiveUpdatedAt),
                  this._fmtDate(task.completed_at),
                  `${progress}%`,
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

      // Build 融合任务 sheet
      if (allBlocks.length > 1) {
        const mergedRows = [this._headerRow()];
        const mergedMetas = [null];

        for (let bi = 0; bi < allBlocks.length; bi++) {
          const block = allBlocks[bi];
          const sepRow = [`── ${block.label} ──`, '', '', '', '', '', '', '', '', '', '', ''];
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

  // ---------- DB import/export ----------

  static _readImportFile(filePath) {
    const buffer = fs.readFileSync(filePath);
    const wb = xlsx.read(buffer, { type: 'buffer' });
    const result = {};
    const metaSheet = wb.Sheets['meta'];
    if (metaSheet) result.meta = xlsx.utils.sheet_to_json(metaSheet);
    else result.meta = [];
    const sheetNames = ['topics', 'categories', 'tasks', 'stages', 'routine_records', 'carry_overs'];
    for (const name of sheetNames) {
      const sheet = wb.Sheets[name];
      result[name] = sheet ? xlsx.utils.sheet_to_json(sheet) : [];
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
    const allTopics = this.db._sheetToJson('topics');
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
      { name: 'topics', headers: ['id', 'name', 'sort_order', 'created_at'], data: allTopics },
      { name: 'categories', headers: ['id', 'name', 'is_routine', 'sort_order', 'created_at', 'topic_id'], data: allCategories },
      { name: 'tasks', headers: ['id', 'category_id', 'title', 'description', 'status', 'progress', 'is_routine', 'created_at', 'started_at', 'completed_at', 'sort_order', 'importance', 'manual_duration', 'contact_person'], data: allTasks },
      { name: 'stages', headers: ['id', 'task_id', 'stage_index', 'note', 'progress_value', 'created_at', 'updated_at', 'is_completed'], data: allStages },
      { name: 'routine_records', headers: ['id', 'task_id', 'year_month', 'quantity', 'filled_at'], data: allRoutines }
    ];

    for (const sheet of arraySheets) {
      const ws = xlsx.utils.aoa_to_sheet(sheet.data.length > 0 ? [sheet.headers, ...sheet.data] : [sheet.headers]);
      xlsx.utils.book_append_sheet(wb, ws, sheet.name);
    }

    const carryHeaders = ['task_id', 'year_month', 'carried_at'];
    const wsCarry = xlsx.utils.aoa_to_sheet(allCarries.length > 0 ? [carryHeaders, ...allCarries] : [carryHeaders]);
    xlsx.utils.book_append_sheet(wb, wsCarry, 'carry_overs');

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
      // Handle topics first
      if (data['topics'] && data['topics'].length > 0) {
        const topicHeaders = ['id', 'name', 'sort_order', 'created_at'];
        const rows = data['topics'].map(row => topicHeaders.map(h => row[h] !== undefined ? row[h] : ''));
        this.db._replaceSheet('topics', rows);
      } else {
        this.db._replaceSheet('topics', []);
      }

      for (const name of ['categories', 'tasks', 'stages', 'routine_records', 'carry_overs']) {
        const sheetName = name;
        const headers = {
          categories: ['id', 'name', 'is_routine', 'sort_order', 'created_at', 'topic_id'],
          tasks: ['id', 'category_id', 'title', 'description', 'status', 'progress', 'is_routine', 'created_at', 'started_at', 'completed_at', 'sort_order', 'importance', 'manual_duration', 'contact_person'],
          stages: ['id', 'task_id', 'stage_index', 'note', 'progress_value', 'created_at', 'updated_at', 'is_completed'],
          routine_records: ['id', 'task_id', 'year_month', 'quantity', 'filled_at'],
          carry_overs: ['task_id', 'year_month', 'carried_at']
        }[name];

        if (data[name] && data[name].length > 0) {
          const rows = data[name].map(row => headers.map(h => row[h] !== undefined ? row[h] : ''));
          this.db._replaceSheet(sheetName, rows);
        } else {
          this.db._replaceSheet(sheetName, []);
        }
      }

      const versionKeys = ['app_version', 'db_schema_version', 'exported_at', 'app_name'];
      const cleanMeta = (data.meta || []).filter(r => !versionKeys.includes(r.key));
      this.db._replaceSheet('meta', cleanMeta.map(r => [r.key, r.value]));
    } else if (mode === 'merge') {
      // Handle topics first
      if (data['topics'] && data['topics'].length > 0) {
        const existing = this.db._sheetToJson('topics');
        const existingIds = new Set(existing.map(r => r[0]));
        for (const item of data['topics']) {
          if (!existingIds.has(item.id)) {
            this.db._appendRows('topics', [[item.id, item.name, item.sort_order, item.created_at]]);
          }
        }
      }

      for (const name of ['categories', 'tasks', 'stages', 'routine_records']) {
        if (data[name] && data[name].length > 0) {
          const existing = this.db._sheetToJson(name);
          const existingIds = new Set(existing.map(r => r[0]));
          const newRows = [];
          for (const item of data[name]) {
            if (!existingIds.has(item.id)) {
              const headers = {
                categories: ['id', 'name', 'is_routine', 'sort_order', 'created_at', 'topic_id'],
                tasks: ['id', 'category_id', 'title', 'description', 'status', 'progress', 'is_routine', 'created_at', 'started_at', 'completed_at', 'sort_order', 'importance', 'manual_duration', 'contact_person'],
                stages: ['id', 'task_id', 'stage_index', 'note', 'progress_value', 'created_at', 'updated_at', 'is_completed'],
                routine_records: ['id', 'task_id', 'year_month', 'quantity', 'filled_at']
              }[name];
              newRows.push(headers.map(h => item[h] !== undefined ? item[h] : ''));
            }
          }
          if (newRows.length > 0) {
            for (const row of newRows) this.db._appendRows(name, [row]);
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

  // ---------- Kanban export ----------

  exportKanban(targetPath, fromMonth, toMonth, personInCharge) {
    const tasks = this.db.getExportData();
    const cats = this.db.getCategories();
    const topcs = this.db.getTopics();
    const catMap = {};
    for (const c of cats) catMap[c.id] = c;
    const topicMap = {};
    for (const t of topcs) topicMap[t.id] = t;

    const headerRow = [
      '任务名称', '任务类型', '负责人', '完成情况', '进度',
      '进展描述', '工作量/交付物', '重要性', '开始时间', '结束时间',
      '时长（公式计算）', '时长（手动填写）', '对接人', '备注'
    ];

    const rows = [headerRow];

    for (const task of tasks) {
      // Filter by date range
      if (task.is_routine) {
        if (fromMonth && toMonth) {
          const rec = (task.records || []).find(r => r.year_month >= fromMonth && r.year_month <= toMonth);
          if (!rec) continue;
        }
      } else {
        if (fromMonth && toMonth) {
          const taskYm = task.created_at ? task.created_at.substring(0, 7) : '';
          if (taskYm > toMonth) continue;
          if (task.completed_at && task.completed_at.substring(0, 7) < fromMonth) continue;
        }
      }

      const cat = catMap[task.category_id];
      const topic = cat ? topicMap[cat.topic_id] : null;

      // Task name = 分类:任务名称
      const taskName = (cat ? cat.name : '') + ':' + task.title;

      // Task type = 专题名称
      const taskType = topic ? topic.name : '';

      // Person in charge
      const charge = personInCharge || '';

      // Completion status - empty
      const completionStatus = '';

      // Progress
      let progress = '0%';
      if (task.is_routine) {
        progress = '—';
      } else if (task.status === 'completed') {
        progress = '100%';
      } else if (task.status === 'created') {
        progress = '0%';
      } else if (task.progress) {
        progress = task.progress + '%';
      }

      // Progress description
      let progressDesc = '';
      if (task.is_routine) {
        progressDesc = task.description || '';
      } else if ((task.stages || []).length <= 1) {
        progressDesc = task.description || '';
      } else {
        const parts = [];
        if (task.description) parts.push(task.description);
        for (const s of (task.stages || [])) {
          if (s.is_completed == 1 && s.note) parts.push(s.note);
        }
        progressDesc = parts.join('\n');
      }

      // Workload
      let workload = '';
      if (task.is_routine) {
        const rec = (task.records || []).find(r => r.year_month >= (fromMonth || '') && r.year_month <= (toMonth || ''));
        workload = rec ? String(rec.quantity) : '';
      }

      // Importance
      const importance = task.importance || 1;

      // Start time = task created_at, routine = empty
      const startTime = task.is_routine ? '' : this._fmtDateTime(task.created_at);

      // End time = completed_at if completed, otherwise empty. Routine = empty
      const endTime = (task.is_routine) ? '' : (task.status === 'completed' ? this._fmtDateTime(task.completed_at) : '');

      // Duration formula = empty
      const durationFormula = '';

      // Manual duration
      const manualDuration = task.manual_duration || '';

      // Contact person
      const contactPerson = task.contact_person || '';

      // Remarks = task description
      const remarks = task.description || '';

      rows.push([
        taskName, taskType, charge, completionStatus, progress,
        progressDesc, workload, importance, startTime, endTime,
        durationFormula, manualDuration, contactPerson, remarks
      ]);
    }

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet(rows);

    // Column widths
    ws['!cols'] = [
      { wch: 24 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
      { wch: 40 }, { wch: 20 }, { wch: 10 }, { wch: 18 }, { wch: 18 },
      { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 30 }
    ];

    // Style header row
    for (let C = 0; C < 14; C++) {
      const addr = xlsx.utils.encode_cell({ r: 0, c: C });
      if (!ws[addr]) ws[addr] = { v: headerRow[C], t: 's' };
      ws[addr].s = {
        font: { bold: true, sz: 12 },
        fill: { patternType: 'solid', fgColor: { rgb: 'D9E1F2' } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: {
          top: { style: 'thin', color: { rgb: '000000' } },
          bottom: { style: 'thin', color: { rgb: '000000' } },
          left: { style: 'thin', color: { rgb: '000000' } },
          right: { style: 'thin', color: { rgb: '000000' } }
        }
      };
    }

    // Style data rows
    for (let R = 1; R < rows.length; R++) {
      for (let C = 0; C < 14; C++) {
        const addr = xlsx.utils.encode_cell({ r: R, c: C });
        if (!ws[addr]) {
          ws[addr] = { v: rows[R][C] !== undefined ? rows[R][C] : '', t: 's' };
        }
        ws[addr].s = {
          alignment: { vertical: 'center', wrapText: true },
          border: {
            top: { style: 'thin', color: { rgb: '000000' } },
            bottom: { style: 'thin', color: { rgb: '000000' } },
            left: { style: 'thin', color: { rgb: '000000' } },
            right: { style: 'thin', color: { rgb: '000000' } }
          }
        };
      }
    }

    // Row heights
    ws['!rows'] = [{ hpx: 24 }];
    for (let R = 1; R < rows.length; R++) ws['!rows'].push({ hpx: 30 });

    xlsx.utils.book_append_sheet(wb, ws, '看板数据');

    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    xlsx.writeFile(wb, targetPath);
    return targetPath;
  }

}

module.exports = Exporter;
