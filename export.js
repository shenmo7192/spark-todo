const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

class Exporter {
  constructor(db) {
    this.db = db;
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
      const rows = [];
      rows.push([
        '分类', '任务名称', '文本描述', '段号', '阶段备注(更新内容)',
        '任务接收时间(创建时间)', '开始时间', '阶段更新时间', '结束时间',
        '完成度%', '状态'
      ]);

      for (const task of tasks) {
        if (task.is_routine) {
          this._exportRoutineRow(task, ym, rows);
        } else {
          this._exportStagesForMonth(task, ym, rows, sortedMonths);
        }
      }

      if (rows.length > 1) {
        const ws = xlsx.utils.aoa_to_sheet(rows);
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
        task.created_at || '',
        '-',
        rec.filled_at || '',
        '-',
        '-',
        '日常工作'
      ]);
    }
  }

  _exportStagesForMonth(task, ym, rows, allYearMonths) {
    const stages = task.stages || [];
    const now = new Date().toISOString();
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
          task.created_at || '',
          task.started_at || '',
          '',
          task.completed_at || '',
          '0%',
          task.status === 'completed' ? '已完成' :
            task.status === 'in_progress' ? '进行中' : '已创建'
        ]);
      }
      return;
    }

    for (let i = 0; i < stages.length; i++) {
      const s = stages[i];
      const stageCreatedYm = s.created_at ? s.created_at.substring(0, 7) : null;
      const stageUpdatedYm = s.updated_at ? s.updated_at.substring(0, 7) : stageCreatedYm;
      const stageIndex = this._findMonthIndex(ym, allYearMonths);

      if (!stageCreatedYm) continue;
      if (ym < stageCreatedYm) continue;

      if (taskEndYm && ym > taskEndYm) continue;

      let effectiveNote = s.note || '';
      let effectiveProgress = s.progress_value;
      let effectiveUpdatedAt = s.updated_at || s.created_at;

      const isStageCreatedThisMonth = (stageCreatedYm === ym);
      const isStageUpdatedThisMonth = (stageUpdatedYm === ym) && (stageCreatedYm !== ym);

      if (!isStageCreatedThisMonth && !isStageUpdatedThisMonth) {
        const hasNewerStage = stages.some((ns, nj) =>
          nj > i && ns.created_at && ns.created_at.substring(0, 7) <= ym
        );
        if (hasNewerStage) {
          continue;
        }

        if (ym > stageCreatedYm) {
          const nextStage = stages.find((ns, nj) =>
            nj > i && ns.created_at && ns.created_at.substring(0, 7) > stageCreatedYm
          );

          if (taskCompleted) {
            effectiveNote = `[跨月延续] ${s.note || ''}`;
            effectiveUpdatedAt = task.completed_at;
          } else {
            effectiveNote = `[跨月延续] ${s.note || ''}`;
          }
        }
      }

      rows.push([
        task.category?.name || '',
        task.title,
        task.description || '',
        i + 1,
        effectiveNote,
        task.created_at || '',
        task.started_at || '',
        effectiveUpdatedAt,
        task.completed_at || '',
        `${effectiveProgress}%`,
        task.status === 'completed' ? '已完成' :
          task.status === 'in_progress' ? '进行中' : '已创建'
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
        const rows = [];
        rows.push([
          '分类', '任务名称', '文本描述', '段号', '阶段备注(更新内容)',
          '任务接收时间(创建时间)', '开始时间', '阶段更新时间', '结束时间',
          '完成度%', '状态'
        ]);

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
                task.created_at || '',
                '-',
                task.routineRecord.filled_at || '',
                '-',
                '-',
                '日常工作'
              ]);
            }
          } else {
            const stages = task.stages || [];
            if (stages.length === 0) {
              rows.push([
                cat.name,
                task.title,
                task.description || '',
                '-',
                '',
                task.created_at || '',
                task.started_at || '',
                '',
                task.completed_at || '',
                '0%',
                task.status === 'completed' ? '已完成' :
                  task.status === 'in_progress' ? '进行中' : '已创建'
              ]);
            } else {
              for (let i = 0; i < stages.length; i++) {
                const s = stages[i];
                const stageCreatedYm = s.created_at ? s.created_at.substring(0, 7) : null;
                if (!stageCreatedYm) continue;
                if (ym < stageCreatedYm) continue;

                let effectiveNote = s.note || '';
                let effectiveProgress = s.progress_value;
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

                rows.push([
                  cat.name,
                  task.title,
                  task.description || '',
                  i + 1,
                  effectiveNote,
                  task.created_at || '',
                  task.started_at || '',
                  effectiveUpdatedAt,
                  task.completed_at || '',
                  `${effectiveProgress}%`,
                  task.status === 'completed' ? '已完成' :
                    task.status === 'in_progress' ? '进行中' : '已创建'
                ]);
              }
            }
          }
        }

        if (rows.length > 1) {
          const ws = xlsx.utils.aoa_to_sheet(rows);
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
