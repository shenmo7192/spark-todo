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
}

module.exports = Exporter;
