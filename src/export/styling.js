// Formatting & Excel styling helpers for exports

const COL_COUNT = 12;

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

function _stageProgress(stageIndex, totalStages) {
  if (totalStages <= 0) return 0;
  return Math.round((stageIndex / totalStages) * 100);
}

function _monthFirstDay(ym) {
  return `${ym}-01`;
}

function _monthLastDay(ym) {
  const [y, m] = ym.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${ym}-${String(lastDay).padStart(2, '0')}`;
}

function _statusLabel(status) {
  const map = { created: '已创建', in_progress: '进行中', completed: '已完成' };
  return map[status] || status;
}

function _headerRow() {
  return [
    '专题', '分类', '任务名称', '文本描述', '第几段', '阶段备注（更新内容）',
    '接收时间', '开始时间', '更新时间', '结束时间',
    '完成度', '状态'
  ];
}

function _columnWidths() {
  return [
    { wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 30 }, { wch: 12 }, { wch: 35 },
    { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 10 },
    { wch: 10 }
  ];
}

function _thinBorder() {
  return { style: 'thin', color: { rgb: '000000' } };
}

function _mediumBorder() {
  return { style: 'medium', color: { rgb: '000000' } };
}

function _statusBgColor(statusLabel) {
  if (statusLabel === '已创建') return 'FFC7CE';
  if (statusLabel === '进行中') return 'FFE211';
  if (statusLabel === '已完成') return '39C5BB';
  if (statusLabel === '日常工作') return '66CCFF';
  return null;
}

function _rowMetasToTaskGroups(rows, rowMetas) {
  const groups = [];
  let i = 1;
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

function _createStyledSheet(rows, taskGroups, rowMetas) {
  const xlsx = require('xlsx-js-style');
  const lastDataRow = rows.length - 1;
  const lastCol = COL_COUNT - 1;

  const ws = {};
  ws['!ref'] = xlsx.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastDataRow, c: lastCol } });
  ws['!cols'] = _columnWidths();

  const rowHeights = [{ hpx: 24 }];
  for (let r = 1; r <= lastDataRow; r++) rowHeights.push({ hpx: 40 });
  ws['!rows'] = rowHeights;

  for (let R = 0; R < rows.length; R++) {
    for (let C = 0; C < COL_COUNT; C++) {
      const addr = xlsx.utils.encode_cell({ r: R, c: C });
      const rawVal = rows[R][C] !== undefined ? rows[R][C] : '';
      const cell = { v: rawVal, t: 's' };
      const statusLabel = rows[R][10] || '';

      cell.s = { alignment: { vertical: 'center', wrapText: true } };

      if (R === 0) {
        cell.s.font = { bold: true, sz: 12 };
        cell.s.fill = { patternType: 'solid', fgColor: { rgb: 'D9E1F2' } };
        cell.s.alignment.horizontal = 'center';
      } else {
        const bg = _statusBgColor(statusLabel);
        if (bg) cell.s.fill = { patternType: 'solid', fgColor: { rgb: bg } };
      }

      cell.s.border = {
        top: _thinBorder(), bottom: _thinBorder(),
        left: _thinBorder(), right: _thinBorder()
      };

      ws[addr] = cell;
    }
  }

  const merges = [];
  const mediumB = _mediumBorder();

  for (const g of taskGroups) {
    if (g.endRow > g.startRow) {
      for (const col of [0, 1, 2]) {
        merges.push({ s: { r: g.startRow, c: col }, e: { r: g.endRow, c: col } });
      }
    }
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

module.exports = {
  COL_COUNT,
  _fmtDate,
  _fmtDateTime,
  _stageProgress,
  _monthFirstDay,
  _monthLastDay,
  _statusLabel,
  _headerRow,
  _columnWidths,
  _thinBorder,
  _mediumBorder,
  _statusBgColor,
  _rowMetasToTaskGroups,
  _createStyledSheet
};
