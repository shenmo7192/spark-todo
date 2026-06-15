// Init, month navigation, reminders, new task & category modals, misc bindings

async function init() {
  try {
    currentYearMonth = getNowYearMonth();
    try { await loadAllMonths(); } catch(e) { console.error('loadAllMonths failed:', e); }
    if (allMonths.length === 0) allMonths = [currentYearMonth];
    populateYearMonthSelects();
    populateExportMonthSelects();
    $('monthSelect').value = currentYearMonth.substring(5);
    $('yearSelect').value = currentYearMonth.substring(0, 4);
    try { await loadTopics(); } catch(e) { console.error('loadTopics failed:', e); }
    try { await checkAllRoutineReminders(); } catch(e) { console.error('checkAllRoutineReminders failed:', e); }
  } catch(e) { console.error('init failed:', e); }
}

async function loadAllMonths() {
  var activeMonths = await window.electronAPI.getAllActiveMonths();
  var set = new Set(activeMonths);
  set.add(currentYearMonth);
  allMonths = Array.from(set).filter(Boolean).sort();
}

function populateYearMonthSelects() {
  var yearSel = $('yearSelect');
  yearSel.innerHTML = '';
  var now = new Date();
  var currentYear = now.getFullYear();
  var currentMonth = String(now.getMonth() + 1).padStart(2, '0');
  for (var y = currentYear - 20; y <= currentYear + 1; y++) {
    var opt = document.createElement('option');
    opt.value = y; opt.textContent = y + '年' + (y === currentYear ? ' (当前)' : '');
    yearSel.appendChild(opt);
  }
  var monthSel = $('monthSelect');
  monthSel.innerHTML = '';
  for (var m = 1; m <= 12; m++) {
    var val = String(m).padStart(2, '0');
    var mopt = document.createElement('option');
    mopt.value = val; mopt.textContent = val + '月' + (val === currentMonth ? ' (当前)' : '');
    monthSel.appendChild(mopt);
  }
}

async function switchMonth(ym) {
  currentYearMonth = ym;
  $('yearSelect').value = ym.substring(0, 4);
  $('monthSelect').value = ym.substring(5);
  await loadTasks(currentCategoryId);
}

function switchMonthFromSelects() {
  var year = $('yearSelect').value;
  var month = $('monthSelect').value;
  if (year && month) {
    var ym = year + '-' + month;
    if (ym !== currentYearMonth) switchMonth(ym);
  }
}

$('yearSelect').onchange = switchMonthFromSelects;
$('monthSelect').onchange = switchMonthFromSelects;

function setStarRating(val) {
  currentStarRating = val;
  var stars = document.querySelectorAll('#starRating .star');
  stars.forEach(function(star) {
    var sv = parseInt(star.dataset.val);
    star.classList.toggle('active', sv > 0 && sv <= val);
  });
}

$('starRating').addEventListener('click', function(e) {
  var star = e.target.closest('.star');
  if (!star) return;
  setStarRating(parseInt(star.dataset.val));
});

// ---------- New task modal ----------

function openNewTaskModal() {
  $('newTaskModalOverlay').classList.add('show');
  $('newTaskTitle').value = '';
  $('newTaskDesc').value = '';
  $('newTaskStageNote').value = '';
  var nowYm = getNowYearMonth();
  $('newTaskDate').value = (currentYearMonth === nowYm)
    ? new Date().toISOString().substring(0, 10)
    : currentYearMonth + '-01';
  var cat = categories.find(function(c) { return c.id === currentCategoryId; });
  $('newTaskStagePanel').style.display = (cat && cat.is_routine) ? 'none' : 'block';
  setTimeout(function() { $('newTaskTitle').focus(); }, 50);
}

function closeNewTaskModal() {
  $('newTaskModalOverlay').classList.remove('show');
}

$('btnAddTask').onclick = openNewTaskModal;
$('btnCloseNewTaskModal').onclick = closeNewTaskModal;
$('newTaskModalOverlay').onclick = function(e) { if (e.target === $('newTaskModalOverlay')) closeNewTaskModal(); };

$('btnConfirmNewTask').onclick = async function() {
  var title = $('newTaskTitle').value;
  if (!title || !title.trim()) return;
  var cat = categories.find(function(c) { return c.id === currentCategoryId; });
  var isRoutine = cat ? cat.is_routine : false;
  var desc = $('newTaskDesc').value.trim();
  var stageNote = $('newTaskStageNote').value.trim();
  var dateVal = $('newTaskDate').value;
  var createdAt = dateVal ? new Date(dateVal + 'T00:00:00').toISOString() : undefined;
  try {
    var newTaskId = await window.electronAPI.addTask({
      categoryId: currentCategoryId, title: title.trim(), description: desc,
      status: isRoutine ? 'in_progress' : 'created', isRoutine: isRoutine, createdAt: createdAt
    });
    if (!isRoutine && stageNote) {
      await window.electronAPI.addStage({ taskId: newTaskId, note: stageNote, progressValue: 0 });
    }
    closeNewTaskModal();
    await loadTasks(currentCategoryId);
    await loadAllMonths();
    populateExportMonthSelects();
  } catch(e) {
    alert('创建任务失败: ' + (e.message || '未知错误'));
    console.error('addTask error:', e);
  }
};

// ---------- Category modal ----------

function openCatModal() {
  $('catModalOverlay').classList.add('show');
  $('catName').value = '';
  $('catIsRoutine').checked = false;
  populateTopicSelect($('catTopic'));
}

function closeCatModal() {
  $('catModalOverlay').classList.remove('show');
}

function populateTopicSelect(sel) {
  sel.innerHTML = '';
  for (var i = 0; i < topics.length; i++) {
    var t = topics[i];
    var opt = document.createElement('option');
    opt.value = t.id; opt.textContent = t.name;
    if (t.id === currentTopicId) opt.selected = true;
    sel.appendChild(opt);
  }
}

$('btnAddCategory').onclick = openCatModal;
$('btnCloseCatModal').onclick = closeCatModal;

$('btnSaveCategory').onclick = async function() {
  var name = $('catName').value.trim();
  if (!name) return alert('请输入分类名称');
  var isRoutine = $('catIsRoutine').checked;
  var topicId = parseInt($('catTopic').value);
  if (!topicId) return alert('请选择所属专题');
  await window.electronAPI.addCategory(name, isRoutine, topicId);
  closeCatModal();
  await loadCategories(currentTopicId);
};

// ---------- Topic modal ----------

function openTopicModal(id) {
  editingTopicId = id || null;
  $('topicModalOverlay').classList.add('show');
  if (id) {
    $('topicModalTitle').textContent = '编辑专题';
    var topic = topics.find(function(t) { return t.id === id; });
    $('topicName').value = topic ? topic.name : '';
  } else {
    $('topicModalTitle').textContent = '添加专题';
    $('topicName').value = '';
  }
  setTimeout(function() { $('topicName').focus(); }, 50);
}

function closeTopicModal() {
  $('topicModalOverlay').classList.remove('show');
  editingTopicId = null;
}

$('btnAddTopic').addEventListener('click', function() { openTopicModal(); });
$('btnCloseTopicModal').onclick = closeTopicModal;
$('topicModalOverlay').onclick = function(e) { if (e.target === $('topicModalOverlay')) closeTopicModal(); };

$('btnSaveTopic').onclick = async function() {
  var name = $('topicName').value.trim();
  if (!name) return alert('请输入专题名称');
  if (editingTopicId) {
    await window.electronAPI.updateTopic(editingTopicId, name);
  } else {
    await window.electronAPI.addTopic(name);
  }
  closeTopicModal();
  await loadTopics();
};

// ---------- Move Category Topic modal ----------

var moveCatTopicTarget = null;

function openMoveCatTopicModal(cat) {
  moveCatTopicTarget = cat;
  $('moveCatTopicModalOverlay').classList.add('show');
  $('moveCatTopicText').textContent = '将分类"' + cat.name + '"切换到以下专题：';
  var sel = $('moveCatTopicSelect');
  sel.innerHTML = '';
  for (var i = 0; i < topics.length; i++) {
    var t = topics[i];
    if (t.id === cat.topic_id) continue;
    var opt = document.createElement('option');
    opt.value = t.id; opt.textContent = t.name;
    sel.appendChild(opt);
  }
  if (sel.options.length === 0) {
    sel.innerHTML = '<option value="">没有其他专题</option>';
  }
}

function closeMoveCatTopicModal() {
  $('moveCatTopicModalOverlay').classList.remove('show');
  moveCatTopicTarget = null;
}

$('btnCloseMoveCatTopicModal').onclick = closeMoveCatTopicModal;
$('moveCatTopicModalOverlay').onclick = function(e) { if (e.target === $('moveCatTopicModalOverlay')) closeMoveCatTopicModal(); };

$('btnConfirmMoveCatTopic').onclick = async function() {
  if (!moveCatTopicTarget) return;
  var newTopicId = parseInt($('moveCatTopicSelect').value);
  if (!newTopicId) return;
  await window.electronAPI.updateCategory(moveCatTopicTarget.id, moveCatTopicTarget.name, undefined, newTopicId);
  closeMoveCatTopicModal();
  await loadCategories(currentTopicId);
};

// ---------- Delete modal ----------

function openDeleteModal() { $('deleteModalOverlay').classList.add('show'); }
function closeDeleteModal() { $('deleteModalOverlay').classList.remove('show'); }

$('btnCloseDeleteModal').onclick = closeDeleteModal;
$('btnCancelDelete').onclick = closeDeleteModal;
$('deleteModalOverlay').onclick = function(e) { if (e.target === $('deleteModalOverlay')) closeDeleteModal(); };

$('btnConfirmDelete').onclick = async function() {
  closeDeleteModal();
  if (deleteTargetMode === 'single') {
    if (deleteTargetId) {
      await window.electronAPI.deleteTask(deleteTargetId);
      if (openedTask && openedTask.id === deleteTargetId) closeTaskModal();
      await loadTasks(currentCategoryId);
    }
  } else if (deleteTargetMode === 'batch') {
    var ids = Array.from(selectedTaskIds);
    for (var i = 0; i < ids.length; i++) await window.electronAPI.deleteTask(ids[i]);
    selectedTaskIds.clear();
    updateBulkBar();
    await loadTasks(currentCategoryId);
  }
  deleteTargetId = null;
};

// ---------- Bulk actions ----------

$('btnBulkComplete').onclick = handleBulkComplete;
$('btnBulkDelete').onclick = handleBulkDelete;
$('btnBulkMove').onclick = openBulkMoveModal;
$('btnBulkCancel').onclick = function() {
  selectedTaskIds.clear();
  updateBulkBar();
  renderTasks();
};

async function openBulkMoveModal() {
  var cat = categories.find(function(c) { return c.id === currentCategoryId; });
  var currentIsRoutine = cat ? cat.is_routine : false;
  $('bulkMoveText').textContent = '将选中的 ' + selectedTaskIds.size + ' 个任务迁移到以下分类（仅限同类型）：';
  var sel = $('bulkMoveCategory');
  sel.innerHTML = '';
  var allCats = await window.electronAPI.getCategories();
  var allTopics = await window.electronAPI.getTopics();

  for (var ti = 0; ti < allTopics.length; ti++) {
    var topic = allTopics[ti];
    var topicCats = allCats.filter(function(c) { return c.topic_id === topic.id && c.is_routine == currentIsRoutine && c.id !== currentCategoryId; });
    if (topicCats.length === 0) continue;
    var group = document.createElement('optgroup');
    group.label = topic.name;
    for (var ci = 0; ci < topicCats.length; ci++) {
      var c = topicCats[ci];
      var opt = document.createElement('option');
      opt.value = c.id; opt.textContent = c.name;
      group.appendChild(opt);
    }
    sel.appendChild(group);
  }
  if (sel.options.length === 0) sel.innerHTML = '<option value="">没有可用的同类型分类</option>';
  $('bulkMoveModalOverlay').classList.add('show');
}

function closeBulkMoveModal() { $('bulkMoveModalOverlay').classList.remove('show'); }

$('btnCloseBulkMoveModal').onclick = closeBulkMoveModal;
$('bulkMoveModalOverlay').onclick = function(e) { if (e.target === $('bulkMoveModalOverlay')) closeBulkMoveModal(); };

$('btnConfirmBulkMove').onclick = async function() {
  var newCategoryId = parseInt($('bulkMoveCategory').value);
  if (!newCategoryId) return;
  await window.electronAPI.bulkChangeTaskCategory(Array.from(selectedTaskIds), newCategoryId);
  selectedTaskIds.clear();
  updateBulkBar();
  closeBulkMoveModal();
  await loadTasks(currentCategoryId);
};

// ---------- Overview modal ----------

$('btnOverview').onclick = openOverviewModal;
$('btnCloseOverviewModal').onclick = closeOverviewModal;
$('overviewModalOverlay').onclick = function(e) { if (e.target === $('overviewModalOverlay')) closeOverviewModal(); };

function openOverviewModal() {
  $('overviewModalOverlay').classList.add('show');
  populateOverviewYearSelect();
  loadOverviewData();
}

function closeOverviewModal() { $('overviewModalOverlay').classList.remove('show'); }

function populateOverviewYearSelect() {
  var sel = $('overviewYearSelect');
  sel.innerHTML = '';
  var currentYear = new Date().getFullYear();
  for (var y = currentYear - 5; y <= currentYear + 1; y++) {
    var opt = document.createElement('option');
    opt.value = y; opt.textContent = y + '年' + (y === currentYear ? ' (当前)' : '');
    sel.appendChild(opt);
  }
  sel.value = currentYear;
  sel.onchange = function() { loadOverviewData(); };
}

async function loadOverviewData() {
  var year = parseInt($('overviewYearSelect').value);
  var data = await window.electronAPI.getAllTasksByYear(year);
  var grid = $('overviewGrid');
  grid.innerHTML = '';
  var months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

  for (var m = 1; m <= 12; m++) {
    var ym = year + '-' + String(m).padStart(2, '0');
    var tasksForMonth = data[ym] || [];
    var card = document.createElement('div');
    card.className = 'overview-month-card';

    if (tasksForMonth.length === 0) {
      card.innerHTML = '<h3>' + months[m - 1] + '</h3><div class="overview-month-empty">无任务</div>';
    } else {
      var itemsHtml = '';
      for (var ti = 0; ti < tasksForMonth.length; ti++) {
        var t = tasksForMonth[ti];
        var dotClass = t.is_routine ? 'routine' : t.status;
        itemsHtml += '<div class="overview-task-item" data-task-id="' + t.id + '" data-category-id="' + t.categoryId + '" data-year-month="' + ym + '" title="' + escapeHtml(t.title) + '"><span class="overview-task-dot ' + dotClass + '"></span><span class="overview-task-title">' + escapeHtml(t.title) + '</span></div>';
      }
      card.innerHTML = '<h3>' + months[m - 1] + ' (' + tasksForMonth.length + ')</h3><div class="overview-task-list">' + itemsHtml + '</div>';
    }

    var items = card.querySelectorAll('.overview-task-item');
    for (var ii = 0; ii < items.length; ii++) {
      var item = items[ii];
      item.addEventListener('click', function(e) {
        var tgt = e.currentTarget;
        var taskId = parseInt(tgt.dataset.taskId);
        var categoryId = parseInt(tgt.dataset.categoryId);
        var om = tgt.dataset.yearMonth;
        closeOverviewModal();
        if (currentCategoryId !== categoryId) {
          currentCategoryId = categoryId;
          renderTabs();
        }
        currentYearMonth = om;
        $('yearSelect').value = om.substring(0, 4);
        $('monthSelect').value = om.substring(5);
        loadTasks(currentCategoryId).then(function() { openTaskModal(taskId); });
      });
    }

    grid.appendChild(card);
  }
}

// ---------- Settings & DB import/export ----------

var pendingImportData = null;

function openSettingsModal() { $('settingsModalOverlay').classList.add('show'); loadSettingsInfo(); }
function closeSettingsModal() { $('settingsModalOverlay').classList.remove('show'); }

async function loadSettingsInfo() {
  var isElectron = typeof window.electronAPI.getVersion === 'function';
  if (isElectron) {
    try {
      var ver = await window.electronAPI.getVersion();
      var schema = await window.electronAPI.getDbSchemaVersion();
      $('settingsVersion').textContent = ver;
      $('settingsDbSchema').textContent = schema;
    } catch(e) {
      $('settingsVersion').textContent = '1.3.2';
      $('settingsDbSchema').textContent = '1';
    }
    $('settingsPlatform').textContent = 'Electron';
  } else {
    $('settingsVersion').textContent = '1.3.2';
    $('settingsDbSchema').textContent = '1';
    $('settingsPlatform').textContent = 'Web (浏览器)';
  }
  try {
    var person = await window.electronAPI.getSetting('person_in_charge');
    $('settingsPersonInCharge').value = person || '';
  } catch(e) {}
}

$('btnSettings').onclick = openSettingsModal;
$('btnCloseSettingsModal').onclick = closeSettingsModal;
$('settingsModalOverlay').onclick = function(e) { if (e.target === $('settingsModalOverlay')) closeSettingsModal(); };

$('btnSavePersonInCharge').onclick = async function() {
  var name = $('settingsPersonInCharge').value.trim();
  await window.electronAPI.setSetting('person_in_charge', name);
  alert('负责人已保存');
};

$('btnExportDB').onclick = async function() {
  var isElectron = typeof window.electronAPI.getVersion === 'function';
  if (isElectron) {
    var result = await window.electronAPI.showSaveDialog({
      title: '导出数据备份',
      defaultPath: 'SparkTodo_备份_' + new Date().toISOString().substring(0, 10) + '.xlsx',
      filters: [{ name: 'Excel 文件', extensions: ['xlsx'] }]
    });
    if (!result.canceled && result.filePath) {
      var res = await window.electronAPI.exportExcelDB(result.filePath);
      if (res.success) { showToast('数据备份导出成功！'); closeSettingsModal(); }
      else { showToast('导出失败: ' + (res.error || '未知错误'), 'error'); }
    }
  } else {
    closeSettingsModal();
    await window.electronAPI.exportExcelDB();
  }
};

$('btnImportDB').onclick = async function() {
  var isElectron = typeof window.electronAPI.getVersion === 'function';
  if (isElectron) {
    var result = await window.electronAPI.showOpenDialog({
      title: '选择数据备份文件',
      filters: [{ name: 'Excel 文件', extensions: ['xlsx'] }],
      properties: ['openFile']
    });
    if (!result.canceled && result.filePaths.length > 0) {
      closeSettingsModal();
      try {
        var parsed = await window.electronAPI.importExcelDB(result.filePaths[0]);
        pendingImportData = parsed.data;
        showImportConfirm(parsed);
      } catch(err) {
        alert('文件读取失败: ' + err.message);
      }
    }
  } else {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx';
    input.onchange = async function(e) {
      var file = e.target.files[0];
      if (!file) return;
      closeSettingsModal();
      try {
        var p = await window.electronAPI.importExcelDB(file);
        pendingImportData = p.data;
        showImportConfirm(p);
      } catch(err) {
        alert('文件读取失败: ' + err.message);
      }
    };
    input.click();
  }
};

function showImportConfirm(parsed) {
  var catCount = parsed.data.categories ? parsed.data.categories.length : 0;
  var taskCount = parsed.data.tasks ? parsed.data.tasks.length : 0;
  var stageCount = parsed.data.stages ? parsed.data.stages.length : 0;

  $('importConfirmBody').innerHTML =
    '<p>检测到数据文件：</p>' +
    '<div class="about-info" style="margin:10px 0;">' +
    '<p>📦 文件版本: <strong>' + parsed.version + '</strong></p>' +
    '<p>📐 数据架构: <strong>v' + parsed.schemaVersion + '</strong></p>' +
    '<p>📂 分类: <strong>' + catCount + '</strong> 个</p>' +
    '<p>📋 任务: <strong>' + taskCount + '</strong> 条</p>' +
    '<p>📝 阶段: <strong>' + stageCount + '</strong> 条</p>' +
    '</div>' +
    '<p style="color:var(--text-secondary);font-size:13px;">请选择导入方式：</p>';

  $('importConfirmModalOverlay').classList.add('show');
}

function closeImportConfirm() { $('importConfirmModalOverlay').classList.remove('show'); pendingImportData = null; }

$('btnCloseImportConfirmModal').onclick = closeImportConfirm;
$('btnImportCancel').onclick = closeImportConfirm;
$('importConfirmModalOverlay').onclick = function(e) { if (e.target === $('importConfirmModalOverlay')) closeImportConfirm(); };

$('btnImportReplace').onclick = async function() {
  if (!pendingImportData) return;
  var importData = pendingImportData;
  closeImportConfirm();
  try {
    await window.electronAPI.importData(importData, 'replace');
    alert('数据已导入（替换模式），正在刷新...');
    await loadTopics();
    if (currentCategoryId) await loadTasks(currentCategoryId);
    await loadAllMonths();
    populateExportMonthSelects();
  } catch(err) { alert('导入失败: ' + err.message); }
};

$('btnImportMerge').onclick = async function() {
  if (!pendingImportData) return;
  var importData = pendingImportData;
  closeImportConfirm();
  try {
    await window.electronAPI.importData(importData, 'merge');
    alert('数据已导入（合并模式），正在刷新...');
    await loadTopics();
    if (currentCategoryId) await loadTasks(currentCategoryId);
    await loadAllMonths();
    populateExportMonthSelects();
  } catch(err) { alert('导入失败: ' + err.message); }
};

// ---------- Remaining event bindings ----------

$('modalOverlay').onclick = function(e) { if (e.target === $('modalOverlay')) saveAndCloseTaskModal(); };
$('catModalOverlay').onclick = function(e) { if (e.target === $('catModalOverlay')) closeCatModal(); };
$('btnCloseModal').onclick = closeTaskModal;

init();
