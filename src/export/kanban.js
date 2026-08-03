// Kanban export – 看板数据导出

function exportKanban(targetPath, fromMonth, toMonth, personInCharge) {
  const xlsx = require('xlsx-js-style');
  const path = require('path');
  const fs = require('fs');

  const tasks = this.db.getExportData();
  const cats = this.db.getCategories();
  const topcs = this.db.getTopics();
  const catMap = {};
  for (const c of cats) catMap[c.id] = c;
  const topicMap = {};
  for (const t of topcs) topicMap[t.id] = t;

  // 日常任务：已经过去的月份视为已完成，进度记为 100%（仅影响日常任务）
  const now = new Date();
  const nowYm = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

  const headerRow = [
    '任务名称', '任务类型', '负责人', '完成情况', '进度',
    '进展描述', '工作量/交付物', '重要性', '开始时间', '结束时间',
    '时长（公式计算）', '时长（手动填写）', '对接人', '备注'
  ];

  const rows = [headerRow];

  for (const task of tasks) {
    if (task.is_routine) {
      let records = task.records || [];
      if (fromMonth && toMonth) {
        records = records.filter(r => r.year_month >= fromMonth && r.year_month <= toMonth);
      }
      if (records.length === 0) continue;

      const cat = catMap[task.category_id];
      const topic = cat ? topicMap[cat.topic_id] : null;
      const taskName = (cat ? cat.name : '') + ':' + task.title;
      const taskType = topic ? topic.name : '';
      const charge = personInCharge || '';
      const completionStatus = '';
      const progressDesc = task.description || '';
      const importance = task.importance || 1;
      const durationFormula = '';
      const manualDuration = task.manual_duration || '';
      const contactPerson = task.contact_person || '';
      const remarks = task.description || '';

      for (const rec of records) {
        // 已过去的月份视为已完成，进度 100%
        const progress = rec.year_month < nowYm ? '100%' : '—';
        rows.push([
          taskName, taskType, charge, completionStatus, progress,
          progressDesc, String(rec.quantity), importance,
          this._monthFirstDay(rec.year_month),
          this._monthLastDay(rec.year_month),
          durationFormula, manualDuration, contactPerson, remarks
        ]);
      }
    } else {
      if (fromMonth && toMonth) {
        const taskYm = task.created_at ? task.created_at.substring(0, 7) : '';
        if (taskYm > toMonth) continue;
        if (task.completed_at && task.completed_at.substring(0, 7) < fromMonth) continue;
      }

      const cat = catMap[task.category_id];
      const topic = cat ? topicMap[cat.topic_id] : null;
      const taskName = (cat ? cat.name : '') + ':' + task.title;
      const taskType = topic ? topic.name : '';
      const charge = personInCharge || '';
      const completionStatus = '';

      let progress = '0%';
      if (task.status === 'completed') {
        progress = '100%';
      } else if (task.status === 'created') {
        progress = '0%';
      } else if (task.progress) {
        progress = task.progress + '%';
      }

      let progressDesc = '';
      if ((task.stages || []).length <= 1) {
        progressDesc = task.description || '';
      } else {
        const parts = [];
        if (task.description) parts.push(task.description);
        for (const s of (task.stages || [])) {
          if (s.is_completed == 1 && s.note) parts.push(s.note);
        }
        progressDesc = parts.join('\n');
      }

      const workload = '';
      const importance = task.importance || 1;
      const startTime = this._fmtDateTime(task.created_at);
      const endTime = task.status === 'completed' ? this._fmtDateTime(task.completed_at) : '';
      const durationFormula = '';
      const manualDuration = task.manual_duration || '';
      const contactPerson = task.contact_person || '';
      const remarks = task.description || '';

      rows.push([
        taskName, taskType, charge, completionStatus, progress,
        progressDesc, workload, importance, startTime, endTime,
        durationFormula, manualDuration, contactPerson, remarks
      ]);
    }
  }

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet(rows);

  ws['!cols'] = [
    { wch: 24 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 40 }, { wch: 20 }, { wch: 10 }, { wch: 18 }, { wch: 18 },
    { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 30 }
  ];

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

  ws['!rows'] = [{ hpx: 24 }];
  for (let R = 1; R < rows.length; R++) ws['!rows'].push({ hpx: 30 });

  xlsx.utils.book_append_sheet(wb, ws, '看板数据');

  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  xlsx.writeFile(wb, targetPath);
  return targetPath;
}

module.exports = { exportKanban };
