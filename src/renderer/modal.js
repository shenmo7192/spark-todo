// Task modal, stage editing, routine panel, status buttons

async function checkAllRoutineReminders() {
  var allCategories = await window.electronAPI.getCategories();
  var routineCats = allCategories.filter(function(c) { return c.is_routine; });
  var allMissing = [];

  for (var ci = 0; ci < routineCats.length; ci++) {
    var cat = routineCats[ci];
    var unfilled = await window.electronAPI.checkRoutineUnfilled(cat.id, currentYearMonth);
    for (var ui = 0; ui < unfilled.length; ui++) {
      var item = unfilled[ui];
      allMissing.push({
        task: item.task, catName: cat.name,
        yearMonth: item.yearMonth || item.lastYm,
        isPriorMonth: item.isPriorMonth
      });
    }
  }

  if (allMissing.length) {
    var priorMissing = allMissing.filter(function(m) { return m.isPriorMonth; });
    var curMissing = allMissing.filter(function(m) { return !m.isPriorMonth; });

    var html = '';
    if (priorMissing.length) {
      html += '<p style="margin-bottom:8px;color:var(--danger);">\u26A0\uFE0F 上个月未填报的日常工作：</p>';
      for (var pi = 0; pi < priorMissing.length; pi++) {
        html += '<li style="margin-bottom:4px;"><strong>' + escapeHtml(priorMissing[pi].catName) + '</strong> - ' + escapeHtml(priorMissing[pi].task.title) + ' (' + priorMissing[pi].yearMonth + ')</li>';
      }
    }
    if (curMissing.length) {
      html += '<p style="margin:8px 0 4px;color:var(--warning);">\u{1F4CB} 本月待填报的日常工作：</p>';
      for (var cmi = 0; cmi < curMissing.length; cmi++) {
        html += '<li style="margin-bottom:4px;"><strong>' + escapeHtml(curMissing[cmi].catName) + '</strong> - ' + escapeHtml(curMissing[cmi].task.title) + '</li>';
      }
    }

    $('remindList').innerHTML = html;
    $('remindText').textContent = priorMissing.length
      ? '以下日常工作上月未填报，请先补填，再刷新本月数据：'
      : '以下日常工作本月尚未填报：';
    $('remindModalOverlay').classList.add('show');

    $('btnRemindOk').onclick = async function() {
      $('remindModalOverlay').classList.remove('show');
      if (priorMissing.length) {
        var cat = categories.find(function(c) { return c.id === priorMissing[0].task.category_id; });
        if (cat) {
          currentCategoryId = cat.id;
          renderTabs();
          await loadTasks(currentCategoryId);
        }
      }
    };
  }
}

async function openTaskModal(taskId) {
  var fullTask = await window.electronAPI.getTaskById(taskId);
  if (!fullTask) return;

  var idx = -1;
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === taskId) { idx = i; break; }
  }
  if (idx >= 0) {
    var existingRoutineRecord = tasks[idx].routineRecord;
    tasks[idx] = Object.assign({}, tasks[idx], fullTask);
    if (existingRoutineRecord) {
      tasks[idx].routineRecord = existingRoutineRecord;
    }
  }
  openedTask = tasks.find(function(t) { return t.id === taskId; });
  if (!openedTask) return;

  $('modalOverlay').classList.add('show');
  $('taskId').value = openedTask.id;
  $('taskTitle').value = openedTask.title;
  $('taskDesc').value = openedTask.description || '';

  setStarRating(openedTask.importance || 1);
  $('taskManualDuration').value = openedTask.manual_duration || '';
  $('taskContactPerson').value = openedTask.contact_person || '';

  await populateTaskCategorySelect(openedTask);

  var cat = categories.find(function(c) { return c.id === currentCategoryId; });
  var isRoutine = cat ? cat.is_routine : false;

  $('routinePanel').style.display = isRoutine ? 'block' : 'none';
  $('stagePanel').style.display = isRoutine ? 'none' : 'block';
  $('statusPanel').style.display = isRoutine ? 'none' : 'block';

  $('timeCreated').textContent = formatDateTime(openedTask.created_at);
  $('timeStarted').textContent = formatDateTime(openedTask.started_at);
  $('timeCompleted').textContent = formatDateTime(openedTask.completed_at);

  updateStatusBadge(openedTask.status);
  updateStatusButtons(openedTask.status);

  if (isRoutine) {
    var isEnded = openedTask.status === 'completed';
    var rec = openedTask.routineRecord;
    $('routineQty').value = rec ? rec.quantity : '';
    $('routineLabelMonth').textContent = currentYearMonth;

    if (isEnded) {
      $('routineQty').disabled = true;
      $('btnSaveRoutine').style.display = 'none';
      $('backfillPanel').style.display = 'none';
      $('routineInfo').innerHTML = '<span style="color:var(--success);">该日常工作已于 ' + formatDateTime(openedTask.completed_at) + ' 结束</span>';
      $('btnEndRoutine').style.display = 'none';
      $('btnReopenRoutine').style.display = '';
      $('endRoutineInfo').style.display = 'inline';
      $('endRoutineInfo').textContent = '已结束';
    } else {
      $('routineQty').disabled = false;
      $('btnSaveRoutine').style.display = '';
      $('btnEndRoutine').style.display = '';
      $('btnReopenRoutine').style.display = 'none';
      var lastYm = getLastYearMonth(currentYearMonth);
      var lastRec = await window.electronAPI.getLastMonthRoutine(openedTask.id, currentYearMonth);
      $('routineInfo').innerHTML = lastRec
        ? '上月(' + lastYm + ')填报: <strong>' + lastRec.quantity + '</strong> (已填报 \u2713)'
        : '上月(' + lastYm + '): <span style="color:var(--danger);">未填报 \u26A0\uFE0F</span>';

      if (!lastRec) {
        $('backfillPanel').style.display = 'block';
        $('backfillLabelMonth').textContent = lastYm;
        $('backfillQty').value = '';
      } else {
        $('backfillPanel').style.display = 'none';
      }
      $('endRoutineInfo').style.display = 'none';
    }
  } else {
    renderStages(openedTask);
  }

  $('newStageNote').value = '';

  clearTimeout(globalNoteTimer);
  globalNoteTimer = setTimeout(function() {
    var ta = $('taskDesc');
    if (ta && openedTask) {
      autoSaveDescription(ta.value);
    }
  }, 2000);
}

function autoSaveDescription(value) {
  if (!openedTask) return;
  if (openedTask.description === value) return;
  openedTask.description = value;
  window.electronAPI.updateTask({
    id: openedTask.id, title: openedTask.title, description: value,
    status: openedTask.status, progress: openedTask.progress
  }).catch(function() {});
}

async function populateTaskCategorySelect(tsk) {
  var sel = $('taskCategory');
  sel.innerHTML = '';
  var taskIsRoutine = tsk ? tsk.is_routine : false;
  var allCats = await window.electronAPI.getCategories();
  var allTopics = await window.electronAPI.getTopics();

  for (var ti = 0; ti < allTopics.length; ti++) {
    var topic = allTopics[ti];
    var topicCats = allCats.filter(function(c) { return c.topic_id === topic.id && c.is_routine == taskIsRoutine; });
    if (topicCats.length === 0) continue;
    var group = document.createElement('optgroup');
    group.label = topic.name;
    for (var ci = 0; ci < topicCats.length; ci++) {
      var cat = topicCats[ci];
      var opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      if (cat.id === tsk.category_id) opt.selected = true;
      group.appendChild(opt);
    }
    sel.appendChild(group);
  }
}

async function closeTaskModal() {
  await autoSaveRoutineQuantity();
  $('modalOverlay').classList.remove('show');
  openedTask = null;
  clearTimeout(globalNoteTimer);
}

async function autoSaveRoutineQuantity() {
  if (!openedTask) return;
  var qtyVal = $('routineQty');
  if (!qtyVal || qtyVal.value === '') return;
  var qty = parseFloat(qtyVal.value);
  if (isNaN(qty)) return;
  await window.electronAPI.fillRoutine({
    taskId: openedTask.id, yearMonth: currentYearMonth, quantity: qty
  });
}

function updateStatusBadge(status) {
  var map = { created: '已创建 (0%)', in_progress: '进行中', completed: '已完成 (100%)' };
  var badge = $('statusBadge');
  badge.textContent = map[status] || status;
  badge.className = 'status-badge status-' + status;
}

function updateStatusButtons(status) {
  var createdBtn = $('btnStatusCreated');
  var progressBtn = $('btnStatusProgress');
  var completeBtn = $('btnStatusComplete');
  var revertBtn = $('btnStatusRevert');

  createdBtn.className = 'btn btn-sm' + (status === 'created' ? ' active-btn' : '');
  progressBtn.className = 'btn btn-sm' + (status === 'in_progress' ? ' active-btn' : '');
  completeBtn.className = 'btn btn-sm' + (status === 'completed' ? ' active-btn btn-complete-active' : '');

  if (status === 'completed') {
    createdBtn.disabled = true;
    progressBtn.disabled = true;
    completeBtn.disabled = true;
    revertBtn.style.display = 'inline-block';
  } else {
    createdBtn.disabled = false;
    progressBtn.disabled = false;
    completeBtn.disabled = false;
    revertBtn.style.display = 'none';
  }
}

function renderStages(task) {
  var container = $('stageList');
  container.innerHTML = '';
  var hintEl = $('stageNextHint');
  var stages = task.stages || [];
  if (stages.length === 0) {
    container.innerHTML = '<div class="empty-stages">暂无阶段，请在下方添加第一条阶段进度</div>';
    if (hintEl) hintEl.style.display = 'none';
    return;
  }

  // Show next stage preview
  var nextStageNum = stages.length + 1;
  var completedCount = stages.filter(function(s) { return s.is_completed == 1; }).length;
  var nextProgress = Math.round((completedCount + 1) / nextStageNum * 100);
  if (hintEl) {
    hintEl.style.display = 'block';
    hintEl.innerHTML = '<span class="stage-next-icon">\u{1F449}</span> 下一阶段：<strong>第 ' + nextStageNum + ' 阶段</strong>'
      + '（完成后进度将推进至 <strong>' + nextProgress + '%</strong>）'
      + '<button class="btn-stage-next-jump" id="btnStageNextJump" title="直接跳到下一阶段">\u23ED\uFE0F 完成当前并进入下一阶段</button>';
  }

  // Build stage items (display in reverse: newest/highest index first)
  stages.slice().reverse().forEach(function(s) {
    var div = document.createElement('div');
    div.className = 'stage-item';
    div.draggable = true;
    div.setAttribute('data-stage-id', s.id);

    var isLast = s.stage_index === stages.length;
    var isFirst = s.stage_index === 1;
    var isCompleted = s.is_completed == 1;
    var statusLabel = '';
    if (isFirst && stages.length === 1) statusLabel = ' (当前阶段)';
    else if (isLast) statusLabel = ' (最新阶段)';

    var sid = s.id;
    var stageIndex = s.stage_index;

    div.innerHTML =
      '<span class="stage-drag-handle" title="拖动排序">\u2630</span>' +
      '<div class="stage-item-main">' +
        '<div class="stage-index">第 ' + stageIndex + ' 阶段' + statusLabel + '</div>' +
        '<div class="stage-note" data-stage-id="' + sid + '" title="点击编辑备注">' + escapeHtml(s.note || '无备注') + '</div>' +
        '<div class="stage-time">创建: ' + formatDateTime(s.created_at) + ' | 更新: ' + formatDateTime(s.updated_at) + '</div>' +
      '</div>' +
      '<label class="stage-check ' + (isCompleted ? 'checked' : '') + '" title="' + (isCompleted ? '已完成' : '未完成') + '">' +
        '<input type="checkbox" class="stage-check-input" data-stage-id="' + sid + '" ' + (isCompleted ? 'checked' : '') + '>' +
        '<span class="stage-check-mark">' + (isCompleted ? '\u2713' : '\u2014') + '</span>' +
      '</label>' +
      '<button class="btn-stage-delete" data-stage-id="' + sid + '" title="删除阶段">\u00D7</button>';

    // Drag events
    div.addEventListener('dragstart', function(e) {
      e.dataTransfer.setData('text/plain', String(sid));
      e.dataTransfer.effectAllowed = 'move';
      div.classList.add('stage-dragging');
    });
    div.addEventListener('dragend', function(e) {
      div.classList.remove('stage-dragging');
      container.querySelectorAll('.stage-item').forEach(function(el) { el.classList.remove('stage-drag-over'); });
    });
    div.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      container.querySelectorAll('.stage-item').forEach(function(el) { el.classList.remove('stage-drag-over'); });
      div.classList.add('stage-drag-over');
    });
    div.addEventListener('drop', async function(e) {
      e.preventDefault();
      div.classList.remove('stage-drag-over');
      var draggedId = parseInt(e.dataTransfer.getData('text/plain'));
      if (!draggedId || draggedId === sid) return;

      // Get current display order (reversed stages: highest index first)
      var items = container.querySelectorAll('.stage-item');
      var idsInDisplayOrder = [];
      for (var i = 0; i < items.length; i++) {
        idsInDisplayOrder.push(parseInt(items[i].getAttribute('data-stage-id')));
      }
      // Remove dragged from its old position
      var oldIdx = idsInDisplayOrder.indexOf(draggedId);
      idsInDisplayOrder.splice(oldIdx, 1);
      // Insert at drop position
      var dropIdx = idsInDisplayOrder.indexOf(sid);
      idsInDisplayOrder.splice(dropIdx, 0, draggedId);

      // Convert display order (reverse-chronological) to stage_index order (ascending)
      // Display order: newest first => stage_index should be descending when reading display order
      // So reversed display order = ascending stage_index
      var stageIndexOrder = idsInDisplayOrder.slice().reverse();

      await window.electronAPI.reorderStages(openedTask.id, stageIndexOrder);
      await refreshOpenedTask();
      renderStages(openedTask);
      updateStatusBadge(openedTask.status);
      updateStatusButtons(openedTask.status);
    });

    // Capture values in closure-safe manner using a wrapper
    (function(capturedId, capturedIndex, capturedIsCompleted) {
      var noteEl = div.querySelector('.stage-note');
      noteEl.addEventListener('click', function(e) {
        e.stopPropagation();
        var stageObj = openedTask.stages.find(function(st) { return st.id === capturedId; });
        if (stageObj) startStageNoteEdit(stageObj, noteEl);
      });

      var checkbox = div.querySelector('.stage-check-input');
      checkbox.addEventListener('change', async function(e) {
        e.stopPropagation();
        await window.electronAPI.updateStage({ id: capturedId, is_completed: checkbox.checked ? 1 : 0 });
        await refreshOpenedTask();
        renderStages(openedTask);
        updateStatusBadge(openedTask.status);
        updateStatusButtons(openedTask.status);
      });

      var delBtn = div.querySelector('.btn-stage-delete');
      delBtn.addEventListener('click', async function(e) {
        e.stopPropagation();
        if (capturedIsCompleted && !confirm('确定删除第 ' + capturedIndex + ' 阶段？该阶段已标记为完成。')) return;
        await window.electronAPI.deleteStage(capturedId);
        await refreshOpenedTask();
        renderStages(openedTask);
        updateStatusBadge(openedTask.status);
        updateStatusButtons(openedTask.status);
      });
    })(sid, stageIndex, isCompleted);

    container.appendChild(div);
  });

  // Attach handler for "jump to next stage" button
  var jumpBtn = $('btnStageNextJump');
  if (jumpBtn) {
    jumpBtn.onclick = async function() {
      if (!openedTask) return;
      // Complete all incomplete stages except the last one (if it's the newest)
      var stgs = openedTask.stages || [];
      for (var i = 0; i < stgs.length; i++) {
        if (!stgs[i].is_completed) {
          await window.electronAPI.updateStage({ id: stgs[i].id, is_completed: 1 });
        }
      }
      // Add a new stage
      await window.electronAPI.addStage({ taskId: openedTask.id, note: '' });
      $('newStageNote').value = '';
      await refreshOpenedTask();
      renderStages(openedTask);
      if (openedTask.status === 'created') {
        updateStatusBadge('in_progress');
        updateStatusButtons('in_progress');
      } else {
        updateStatusBadge(openedTask.status);
        updateStatusButtons(openedTask.status);
      }
    };
  }
}

function startStageNoteEdit(stage, el) {
  var textarea = document.createElement('textarea');
  textarea.value = stage.note || '';
  textarea.className = 'textarea';
  textarea.style.cssText = 'font-size:14px;padding:4px 8px;min-height:60px;resize:vertical;';

  el.replaceWith(textarea);
  textarea.focus();

  var finish = async function() {
    var newNote = textarea.value.trimEnd();
    if (newNote !== (stage.note || '')) {
      await window.electronAPI.updateStage({ id: stage.id, note: newNote });
      await refreshOpenedTask();
    }
    renderStages(openedTask);
    updateStatusBadge(openedTask.status);
    updateStatusButtons(openedTask.status);
  };

  textarea.addEventListener('blur', finish);
  textarea.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      textarea.value = stage.note || '';
      finish();
    }
  });
}

async function refreshOpenedTask() {
  if (!openedTask) return;
  var refreshed = await window.electronAPI.getTaskById(openedTask.id);
  if (!refreshed) return;
  var idx = -1;
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === openedTask.id) { idx = i; break; }
  }
  if (idx >= 0) {
    tasks[idx] = Object.assign({}, tasks[idx], refreshed, { stages: refreshed.stages, routineRecord: refreshed.routineRecord });
  }
  openedTask = tasks.find(function(t) { return t.id === openedTask.id; });
}

async function saveAndCloseTaskModal() {
  if (!openedTask) { await closeTaskModal(); return; }
  var title = $('taskTitle').value.trim();
  if (!title) { await closeTaskModal(); return; }

  var newCategoryId = parseInt($('taskCategory').value);
  if (newCategoryId && newCategoryId !== openedTask.category_id) {
    var allCats = await window.electronAPI.getCategories();
    var targetCat = allCats.find(function(c) { return c.id === newCategoryId; });
    if (targetCat && targetCat.is_routine === openedTask.is_routine) {
      await window.electronAPI.changeTaskCategory(openedTask.id, newCategoryId);
    }
  }

  openedTask.title = title;
  openedTask.description = $('taskDesc').value;
  openedTask.importance = currentStarRating;
  openedTask.manual_duration = $('taskManualDuration').value.trim();
  openedTask.contact_person = $('taskContactPerson').value.trim();

  await window.electronAPI.updateTask({
    id: openedTask.id, title: openedTask.title, description: openedTask.description,
    status: openedTask.status, progress: openedTask.progress,
    importance: openedTask.importance, manual_duration: openedTask.manual_duration,
    contact_person: openedTask.contact_person
  });

  await closeTaskModal();
  await loadTasks(currentCategoryId);
}

$('btnSaveTask').onclick = saveAndCloseTaskModal;

$('btnDeleteTask').onclick = async function() {
  if (!openedTask) return;
  deleteTargetId = openedTask.id;
  deleteTargetMode = 'single';
  $('deleteConfirmText').textContent = '确定删除任务"' + openedTask.title + '"? 此操作不可恢复。\n\n相关的所有阶段记录和填报数据将被一并删除。';
  openDeleteModal();
};
