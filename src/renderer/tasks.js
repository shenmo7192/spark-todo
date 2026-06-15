// Task list rendering, drag-drop, quick actions, bulk operations

async function loadTasks(categoryId) {
  if (!categoryId) return;
  await window.electronAPI.carryOverTasks(currentYearMonth, categoryId);
  tasks = await window.electronAPI.getTasks(categoryId, currentYearMonth);
  tasks.sort(function(a, b) {
    var aDone = a.status === 'completed' ? 1 : 0;
    var bDone = b.status === 'completed' ? 1 : 0;
    if (sortOrder === 'status') {
      if (aDone !== bDone) return aDone - bDone;
      var aOrder = parseInt(a.sort_order) || 0;
      var bOrder = parseInt(b.sort_order) || 0;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return new Date(b.created_at) - new Date(a.created_at);
    } else {
      // 'time' - sort by creation time, newest first
      return new Date(b.created_at) - new Date(a.created_at);
    }
  });
  // Refresh pending counts
  try {
    pendingCounts = await window.electronAPI.getCategoryPendingCounts();
    renderTabs();
    renderTopicTabs();
  } catch(e) {}
  renderTasks();
}

function renderTasks() {
  var list = $('taskList');
  list.innerHTML = '';
  var cat = categories.find(function(c) { return c.id === currentCategoryId; });
  var isRoutine = cat ? cat.is_routine : false;

  if (tasks.length === 0) {
    var emptyMsg = isRoutine ? '暂无任务\n点击上方"新建任务"添加日常工作项' : '暂无任务\n点击上方"新建任务"添加任务';
    list.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;"><h3>暂无任务</h3><p>' + (isRoutine ? '点击上方"新建任务"添加日常工作项' : '点击上方"新建任务"添加任务') + '</p></div>';
    return;
  }

  for (var ti = 0; ti < tasks.length; ti++) {
    var task = tasks[ti];
    (function(capturedTask) {
    var card = document.createElement('div');
    card.className = 'task-card' + (capturedTask.status === 'completed' ? ' completed' : '');
    card.dataset.taskId = capturedTask.id;
    card.draggable = true;
    card.addEventListener('dragstart', onDragStart);
    card.addEventListener('dragend', onDragEnd);
    card.addEventListener('dragover', onDragOver);
    card.addEventListener('dragleave', onDragLeave);
    card.addEventListener('drop', onDrop);
    card.onclick = function() {
      if (selectedTaskIds.size > 0) {
        toggleSelectTask(capturedTask.id);
      } else {
        openTaskModal(capturedTask.id);
      }
    };

    var statusClass = 'status-' + capturedTask.status;
    var statusText = ({ created: '已创建', in_progress: '进行中', completed: '已完成' })[capturedTask.status] || capturedTask.status;
    var progressHtml = '';

    if (isRoutine) {
      var isEnded = capturedTask.status === 'completed';
      statusClass = isEnded ? 'status-completed' : 'status-routine';
      statusText = isEnded ? '已结束' : '日常工作';
      var rec = capturedTask.routineRecord;
      var qty = rec ? rec.quantity : (isEnded ? '\u2014' : '未填报');
      var qtyColor = rec ? '' : (isEnded ? '' : 'color:var(--danger);');
      var descHtml = capturedTask.description ? '<div class="task-latest-note">' + escapeHtml('\u{1F4DD} ' + capturedTask.description) + '</div>' : '';
      progressHtml = '<div class="routine-badge" style="' + qtyColor + '">本月填报: ' + qty + '</div>' + descHtml;
    } else {
      var pct = capturedTask.progress || 0;
      var stages = capturedTask.stages || [];
      var stageCount = stages.length;
      var filledCount = 0;
      for (var si = 0; si < stages.length; si++) {
        if (stages[si].is_completed == 1) filledCount++;
      }

      // 卡片上只展示最新一段已完成阶段的备注
      var latestNoteHtml = '';
      var revStages = stages.slice().reverse();
      var newestFilledStage = null;
      for (var rsi = 0; rsi < revStages.length; rsi++) {
        if (revStages[rsi].is_completed == 1) { newestFilledStage = revStages[rsi]; break; }
      }
      if (newestFilledStage) {
        latestNoteHtml = '<div class="task-latest-note">\u{1F4DD} 第' + newestFilledStage.stage_index + '段: ' + escapeHtml(newestFilledStage.note) + '</div>';
      } else if (capturedTask.description) {
        latestNoteHtml = '<div class="task-latest-note">\u{1F4DD} ' + escapeHtml(capturedTask.description) + '</div>';
      }

      progressHtml =
        '<div class="task-progress">' +
          '<div class="progress-bar"><div class="progress-fill ' + (capturedTask.status === 'completed' ? 'completed' : '') + '" style="width:' + pct + '%"></div></div>' +
          '<span>' + pct + '%</span>' +
        '</div>' +
        '<div class="task-meta">已完成: ' + filledCount + '/' + stageCount + ' 段 | 创建: ' + formatDateTime(capturedTask.created_at) + '</div>' +
        latestNoteHtml;
    }

    var isSelected = selectedTaskIds.has(capturedTask.id);
    var completeBtn = (!isRoutine && capturedTask.status !== 'completed') ? '<button class="btn-action complete" data-action="complete" data-id="' + capturedTask.id + '">直接完成</button>' : '';
    var nextBtn = (!isRoutine && capturedTask.status !== 'completed') ? '<button class="btn-action next" data-action="next" data-id="' + capturedTask.id + '">下一阶段</button>' : '';

    card.innerHTML =
      '<div class="task-header">' +
        '<div class="task-title">' + escapeHtml(capturedTask.title) + '</div>' +
        '<span class="task-status ' + statusClass + '">' + statusText + '</span>' +
      '</div>' +
      progressHtml +
      '<div class="card-actions" onclick="event.stopPropagation();">' +
        '<div class="checkbox-wrap">' +
          '<input type="checkbox" id="chk_' + capturedTask.id + '" ' + (isSelected ? 'checked' : '') + '>' +
          '<label for="chk_' + capturedTask.id + '">选择</label>' +
        '</div>' +
        completeBtn + nextBtn +
        '<button class="btn-action delete" data-action="delete" data-id="' + capturedTask.id + '">删除</button>' +
      '</div>';

    card.querySelector('#chk_' + capturedTask.id).onchange = function(e) {
      e.stopPropagation();
      toggleSelectTask(capturedTask.id);
    };

    var actionBtns = card.querySelectorAll('.btn-action');
    for (var ai = 0; ai < actionBtns.length; ai++) {
      var btn = actionBtns[ai];
      btn.onclick = function(e) {
        e.stopPropagation();
        var action = this.dataset.action;
        var id = parseInt(this.dataset.id);
        if (action === 'complete') handleQuickComplete(id);
        if (action === 'next') handleQuickNextStage(id);
        if (action === 'delete') handleQuickDelete(id);
      };
    }

    list.appendChild(card);
    })(task);
  }
}

function toggleSelectTask(id) {
  if (selectedTaskIds.has(id)) {
    selectedTaskIds.delete(id);
  } else {
    selectedTaskIds.add(id);
  }
  updateBulkBar();
  renderTasks();
}

function updateBulkBar() {
  var bar = $('bulkBar');
  if (selectedTaskIds.size > 0) {
    bar.style.display = 'flex';
    $('bulkCount').textContent = '已选择 ' + selectedTaskIds.size + ' 项';
  } else {
    bar.style.display = 'none';
  }
}

var dragSrcId = null;

function onDragStart(e) {
  var card = e.target.closest('.task-card');
  if (!card) return;
  dragSrcId = parseInt(card.dataset.taskId);
  card.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragSrcId);
}

function onDragEnd(e) {
  var card = e.target.closest('.task-card');
  if (card) card.classList.remove('dragging');
  dragSrcId = null;
  var overs = document.querySelectorAll('.task-card.drag-over');
  for (var oi = 0; oi < overs.length; oi++) overs[oi].classList.remove('drag-over');
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  var card = e.target.closest('.task-card');
  if (!card || !dragSrcId) return;
  var targetId = parseInt(card.dataset.taskId);
  if (targetId === dragSrcId) return;
  var srcTask = tasks.find(function(t) { return t.id === dragSrcId; });
  var tgtTask = tasks.find(function(t) { return t.id === targetId; });
  if (!srcTask || !tgtTask) return;
  var srcDone = srcTask.status === 'completed' ? 1 : 0;
  var tgtDone = tgtTask.status === 'completed' ? 1 : 0;
  if (srcDone !== tgtDone) return;
  card.classList.add('drag-over');
}

function onDragLeave(e) {
  var card = e.target.closest('.task-card');
  if (card) card.classList.remove('drag-over');
}

async function onDrop(e) {
  e.preventDefault();
  var card = e.target.closest('.task-card');
  if (card) card.classList.remove('drag-over');
  if (!dragSrcId) return;
  var targetId = card ? parseInt(card.dataset.taskId) : null;
  if (!targetId || targetId === dragSrcId) { dragSrcId = null; return; }

  var srcTask = tasks.find(function(t) { return t.id === dragSrcId; });
  var tgtTask = tasks.find(function(t) { return t.id === targetId; });
  if (!srcTask || !tgtTask) { dragSrcId = null; return; }
  var srcDone = srcTask.status === 'completed' ? 1 : 0;
  var tgtDone = tgtTask.status === 'completed' ? 1 : 0;
  if (srcDone !== tgtDone) { dragSrcId = null; return; }

  var taskList = tasks.slice();
  var srcIdx = taskList.findIndex(function(t) { return t.id === dragSrcId; });
  var tgtIdx = taskList.findIndex(function(t) { return t.id === targetId; });
  if (srcIdx < 0 || tgtIdx < 0) { dragSrcId = null; return; }

  taskList.splice(srcIdx, 1);
  var newTgtIdx = taskList.findIndex(function(t) { return t.id === targetId; });
  taskList.splice(newTgtIdx, 0, srcTask);

  tasks = taskList;
  renderTasks();

  var taskIds = tasks.map(function(t) { return t.id; });
  await window.electronAPI.batchReorderTasks(currentCategoryId, taskIds);

  dragSrcId = null;
}

async function handleQuickComplete(taskId) {
  var task = tasks.find(function(t) { return t.id === taskId; });
  if (!task) return;
  await window.electronAPI.updateTask({
    id: task.id, title: task.title, description: task.description || '',
    status: 'completed', progress: 100
  });
  await loadTasks(currentCategoryId);
}

function handleQuickNextStage(taskId) {
  openTaskModal(taskId);
}

async function handleQuickDelete(taskId) {
  deleteTargetId = taskId;
  deleteTargetMode = 'single';
  var task = tasks.find(function(t) { return t.id === taskId; });
  $('deleteConfirmText').textContent = '确定删除任务"' + (task ? task.title : '') + '"? 此操作不可恢复。相关的所有阶段记录和填报数据将被一并删除。';
  openDeleteModal();
}

async function handleBulkComplete() {
  var ids = Array.from(selectedTaskIds);
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    var task = tasks.find(function(t) { return t.id === id; });
    if (!task || task.status === 'completed') continue;
    await window.electronAPI.updateTask({
      id: task.id, title: task.title, description: task.description || '',
      status: 'completed', progress: 100
    });
  }
  selectedTaskIds.clear();
  updateBulkBar();
  await loadTasks(currentCategoryId);
}

function handleBulkDelete() {
  deleteTargetMode = 'batch';
  $('deleteConfirmText').textContent = '确定删除选中的 ' + selectedTaskIds.size + ' 个任务？此操作不可恢复。';
  openDeleteModal();
}

// Sort order toggle
$('btnSortOrder').onclick = async function() {
  sortOrder = sortOrder === 'status' ? 'time' : 'status';
  var btn = $('btnSortOrder');
  if (sortOrder === 'status') {
    btn.innerHTML = '↓ 按状态';
    btn.title = '切换为按时间排序';
  } else {
    btn.innerHTML = '↓ 按时间';
    btn.title = '切换为按状态排序';
  }
  await loadTasks(currentCategoryId);
};
