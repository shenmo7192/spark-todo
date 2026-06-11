// Export triggers, DB import/export UI, settings, overview, kanban

// ---------- Export modal ----------

function populateExportMonthSelects() {
  var startSel = $('exportStartMonth');
  var endSel = $('exportEndMonth');
  var yearSel = $('exportYear');
  var qYearSel = $('exportQuarterYear');

  startSel.innerHTML = '';
  endSel.innerHTML = '';
  for (var i = 0; i < allMonths.length; i++) {
    var ym = allMonths[i];
    var opt1 = document.createElement('option');
    opt1.value = ym;
    opt1.textContent = ym;
    startSel.appendChild(opt1);
    var opt2 = document.createElement('option');
    opt2.value = ym;
    opt2.textContent = ym;
    endSel.appendChild(opt2);
  }
  if (allMonths.length > 0) {
    var useYm = allMonths.indexOf(currentYearMonth) >= 0 ? currentYearMonth : allMonths[0];
    startSel.value = useYm;
    endSel.value = allMonths.indexOf(currentYearMonth) >= 0 ? currentYearMonth : allMonths[allMonths.length - 1];
  }

  var years = new Set();
  for (var j = 0; j < allMonths.length; j++) years.add(allMonths[j].substring(0, 4));
  var sortedYears = Array.from(years).sort();
  if (yearSel) {
    yearSel.innerHTML = '';
    for (var yi = 0; yi < sortedYears.length; yi++) {
      var y = sortedYears[yi];
      var opt = document.createElement('option');
      opt.value = y; opt.textContent = y + '年';
      yearSel.appendChild(opt);
    }
    if (sortedYears.length > 0) yearSel.value = currentYearMonth.substring(0, 4);
  }
  if (qYearSel) {
    qYearSel.innerHTML = '';
    for (var qyi = 0; qyi < sortedYears.length; qyi++) {
      var qy = sortedYears[qyi];
      var opt2 = document.createElement('option');
      opt2.value = qy; opt2.textContent = qy + '年';
      qYearSel.appendChild(opt2);
    }
    if (sortedYears.length > 0) qYearSel.value = currentYearMonth.substring(0, 4);
  }

  updateExportModeUI();
}

function updateExportModeUI() {
  var mode = $('exportMode').value;
  $('exportYearlyOpts').style.display = mode === 'yearly' ? 'block' : 'none';
  $('exportQuarterlyOpts').style.display = mode === 'quarterly' ? 'block' : 'none';
  $('exportRangeOpts').style.display = (mode === 'monthly' || mode === 'custom') ? 'block' : 'none';
  $('exportDirOpts').style.display = mode === 'monthly' ? 'block' : 'none';
}

function openExportModal() {
  $('exportModalOverlay').classList.add('show');
  $('exportMode').value = 'monthly';
  $('exportDirPath').value = '';
  populateExportMonthSelects();
  updateExportModeUI();
}

function closeExportModal() {
  $('exportModalOverlay').classList.remove('show');
}

$('btnExport').onclick = openExportModal;
$('btnCloseExportModal').onclick = closeExportModal;
$('exportModalOverlay').onclick = function(e) { if (e.target === $('exportModalOverlay')) closeExportModal(); };
$('exportMode').onchange = updateExportModeUI;

var btnChooseExportDir = $('btnChooseExportDir');
if (btnChooseExportDir) {
  btnChooseExportDir.onclick = async function() {
    var result = await window.electronAPI.showOpenDialog({ properties: ['openDirectory'] });
    if (!result.canceled && result.filePaths.length > 0) {
      $('exportDirPath').value = result.filePaths[0];
    }
  };
}

$('btnConfirmExport').onclick = async function() {
  var mode = $('exportMode').value;
  var isElectron = typeof window.electronAPI.getVersion === 'function';
  var fromMonth, toMonth, defaultFileName;

  if (mode === 'yearly') {
    var year = $('exportYear').value;
    fromMonth = year + '-01'; toMonth = year + '-12';
    defaultFileName = '工单台账_' + year + '年度.xlsx';
  } else if (mode === 'quarterly') {
    var qyear = $('exportQuarterYear').value;
    var q = parseInt($('exportQuarter').value);
    var qStart = String((q - 1) * 3 + 1).padStart(2, '0');
    var qEnd = String((q - 1) * 3 + 3).padStart(2, '0');
    fromMonth = qyear + '-' + qStart; toMonth = qyear + '-' + qEnd;
    defaultFileName = '工单台账_' + qyear + '年Q' + q + '.xlsx';
  } else if (mode === 'custom') {
    fromMonth = $('exportStartMonth').value; toMonth = $('exportEndMonth').value;
    if (fromMonth > toMonth) return alert('起始月份不能大于结束月份');
    defaultFileName = '工单台账_' + fromMonth + '_至_' + toMonth + '.xlsx';
  } else {
    var dirPath = $('exportDirPath').value;
    var startMonth = $('exportStartMonth').value;
    var endMonth = $('exportEndMonth').value;
    if (isElectron) {
      if (!dirPath) return alert('请选择导出目录');
      if (startMonth > endMonth) return alert('起始月份不能大于结束月份');
      var res = await window.electronAPI.exportMonthly(dirPath, startMonth, endMonth);
      if (res.success) { alert('导出成功'); closeExportModal(); }
      else { alert('导出失败: ' + (res.error || '未知错误')); }
    } else {
      if (startMonth > endMonth) return alert('起始月份不能大于结束月份');
      var res2 = await window.electronAPI.exportMonthly(dirPath || '台账', startMonth, endMonth);
      if (res2.success) { alert('导出成功 (' + (res2.fileCount || 0) + ' 个文件)'); closeExportModal(); }
      else { alert('导出失败: ' + (res2.error || '未知错误')); }
    }
    return;
  }

  if (isElectron) {
    var result = await window.electronAPI.showSaveDialog({
      title: '保存台账文件', defaultPath: defaultFileName,
      filters: [{ name: 'Excel 文件', extensions: ['xlsx'] }]
    });
    if (!result.canceled && result.filePath) {
      var res3 = await window.electronAPI.exportExcel(result.filePath, fromMonth, toMonth);
      if (res3.success) { alert('导出成功！'); closeExportModal(); }
      else { alert('导出失败: ' + (res3.error || '未知错误')); }
    }
  } else {
    var res4 = await window.electronAPI.exportExcel(defaultFileName, fromMonth, toMonth);
    if (res4.success) { alert('导出成功'); closeExportModal(); }
    else { alert('导出失败: ' + (res4.error || '未知错误')); }
  }
};

// ---------- Kanban export modal ----------

function openKanbanModal() {
  $('kanbanModalOverlay').classList.add('show');
  $('kanbanExportMode').value = 'all';
  populateKanbanSelects();
  updateKanbanModeUI();
}

function closeKanbanModal() {
  $('kanbanModalOverlay').classList.remove('show');
}

function populateKanbanSelects() {
  var yearSel = $('kanbanYear');
  var qYearSel = $('kanbanQuarterYear');
  var monthSel = $('kanbanMonth');
  var years = new Set();
  for (var i = 0; i < allMonths.length; i++) years.add(allMonths[i].substring(0, 4));
  var sortedYears = Array.from(years).sort();
  var currentYear = new Date().getFullYear();

  yearSel.innerHTML = '';
  for (var yi = 0; yi < sortedYears.length; yi++) {
    var y = sortedYears[yi];
    var opt = document.createElement('option');
    opt.value = y; opt.textContent = y + '年';
    if (y === currentYear) opt.selected = true;
    yearSel.appendChild(opt);
  }
  qYearSel.innerHTML = yearSel.innerHTML;
  monthSel.innerHTML = '';
  for (var mi = 0; mi < allMonths.length; mi++) {
    var ym = allMonths[mi];
    var mopt = document.createElement('option');
    mopt.value = ym; mopt.textContent = ym;
    if (ym === currentYearMonth) mopt.selected = true;
    monthSel.appendChild(mopt);
  }
}

function updateKanbanModeUI() {
  var mode = $('kanbanExportMode').value;
  $('kanbanYearlyOpts').style.display = mode === 'yearly' ? 'block' : 'none';
  $('kanbanQuarterlyOpts').style.display = mode === 'quarterly' ? 'block' : 'none';
  $('kanbanMonthlyOpts').style.display = mode === 'monthly' ? 'block' : 'none';
}

$('btnKanban').onclick = openKanbanModal;
$('btnCloseKanbanModal').onclick = closeKanbanModal;
$('kanbanModalOverlay').onclick = function(e) { if (e.target === $('kanbanModalOverlay')) closeKanbanModal(); };
$('kanbanExportMode').onchange = updateKanbanModeUI;

$('btnConfirmKanbanExport').onclick = async function() {
  var mode = $('kanbanExportMode').value;
  var fromMonth, toMonth, defaultFileName;

  if (mode === 'yearly') {
    var y = $('kanbanYear').value;
    fromMonth = y + '-01'; toMonth = y + '-12';
    defaultFileName = '看板数据_' + y + '年度.xlsx';
  } else if (mode === 'quarterly') {
    var qy = $('kanbanQuarterYear').value;
    var q = parseInt($('kanbanQuarter').value);
    var qStart = String((q - 1) * 3 + 1).padStart(2, '0');
    var qEnd = String((q - 1) * 3 + 3).padStart(2, '0');
    fromMonth = qy + '-' + qStart; toMonth = qy + '-' + qEnd;
    defaultFileName = '看板数据_' + qy + '年Q' + q + '.xlsx';
  } else if (mode === 'monthly') {
    fromMonth = $('kanbanMonth').value; toMonth = fromMonth;
    defaultFileName = '看板数据_' + fromMonth + '.xlsx';
  } else {
    fromMonth = null; toMonth = null;
    defaultFileName = '看板数据_全部.xlsx';
  }

  var isElectron = typeof window.electronAPI.getVersion === 'function';
  if (isElectron) {
    var result = await window.electronAPI.showSaveDialog({
      title: '保存看板数据', defaultPath: defaultFileName,
      filters: [{ name: 'Excel 文件', extensions: ['xlsx'] }]
    });
    if (!result.canceled && result.filePath) {
      var res = await window.electronAPI.exportKanban(result.filePath, fromMonth, toMonth);
      if (res.success) { alert('看板数据导出成功！'); closeKanbanModal(); }
      else { alert('导出失败: ' + (res.error || '未知错误')); }
    }
  } else {
    var res2 = await window.electronAPI.exportKanban(defaultFileName, fromMonth, toMonth);
    if (res2.success) { alert('看板数据导出成功'); closeKanbanModal(); }
    else { alert('导出失败: ' + (res2.error || '未知错误')); }
  }
};
