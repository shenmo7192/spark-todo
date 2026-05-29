let categories = [];
let currentCategoryId = null;
let currentYearMonth = '';
let tasks = [];
let openedTask = null;
let selectedTaskIds = new Set();
let deleteTargetId = null;
let deleteTargetMode = 'single';
let allMonths = [];

const $ = (id) => document.getElementById(id);

function formatDateTime(d) {
  if (!d) return '-';
  const date = new Date(d.replace(/-/g, '/'));
  if (isNaN(date)) return d;
  return date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function getNowYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getLastYearMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  const lm = m === 1 ? 12 : m - 1;
  const ly = m === 1 ? y - 1 : y;
  return `${ly}-${String(lm).padStart(2, '0')}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

let globalNoteTimer = null;

async function init() {
  currentYearMonth = getNowYearMonth();
  await loadAllMonths();
  populateYearMonthSelects();
  populateExportMonthSelects();
  $('monthSelect').value = currentYearMonth.substring(5);
  $('yearSelect').value = currentYearMonth.substring(0, 4);
  await loadCategories();
  await checkAllRoutineReminders();
}

async function loadAllMonths() {
  const activeMonths = await window.electronAPI.getAllActiveMonths();
  const set = new Set(activeMonths);
  set.add(currentYearMonth);
  allMonths = Array.from(set).filter(Boolean).sort();
}

function populateYearMonthSelects() {
  const yearSel = $('yearSelect');
  yearSel.innerHTML = '';
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
  for (let y = currentYear - 20; y <= currentYear + 1; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y + '年' + (y === currentYear ? ' (当前)' : '');
    yearSel.appendChild(opt);
  }

  const monthSel = $('monthSelect');
  monthSel.innerHTML = '';
  for (let m = 1; m <= 12; m++) {
    const val = String(m).padStart(2, '0');
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = val + '月' + (val === currentMonth ? ' (当前)' : '');
    monthSel.appendChild(opt);
  }
}

function populateExportMonthSelects() {
  const startSel = $('exportStartMonth');
  const endSel = $('exportEndMonth');
  startSel.innerHTML = '';
  endSel.innerHTML = '';
  for (const ym of allMonths) {
    const opt1 = document.createElement('option');
    opt1.value = ym;
    opt1.textContent = ym;
    startSel.appendChild(opt1);

    const opt2 = document.createElement('option');
    opt2.value = ym;
    opt2.textContent = ym;
    endSel.appendChild(opt2);
  }
  if (allMonths.length > 0) {
    if (allMonths.includes(currentYearMonth)) {
      startSel.value = currentYearMonth;
      endSel.value = currentYearMonth;
    } else {
      startSel.value = allMonths[0];
      endSel.value = allMonths[allMonths.length - 1];
    }
  }
}

async function switchMonth(ym) {
  currentYearMonth = ym;
  $('yearSelect').value = ym.substring(0, 4);
  $('monthSelect').value = ym.substring(5);
  await loadTasks(currentCategoryId);
}

async function loadCategories() {
  categories = await window.electronAPI.getCategories();
  if (categories.length && !currentCategoryId) {
    currentCategoryId = categories[0].id;
  }
  renderTabs();
  if (currentCategoryId) {
    await loadTasks(currentCategoryId);
  }
}

function renderTabs() {
  const bar = $('tabBar');
  bar.innerHTML = '';
  categories.forEach((cat, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'tab-wrap';

    const btn = document.createElement('button');
    btn.className = 'tab' + (cat.id === currentCategoryId ? ' active' : '');
    btn.textContent = cat.name;
    btn.onclick = () => switchCategory(cat.id);

    btn.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startTabRename(cat, btn);
    });

    if (idx > 0) {
      const leftBtn = document.createElement('button');
      leftBtn.className = 'tab-arrow tab-arrow-left';
      leftBtn.innerHTML = '◀';
      leftBtn.title = '向左移动';
      leftBtn.onclick = async (e) => {
        e.stopPropagation();
        await window.electronAPI.moveCategory(cat.id, -1);
        await loadCategories();
      };
      wrap.appendChild(leftBtn);
    }

    if (idx < categories.length - 1) {
      const rightBtn = document.createElement('button');
      rightBtn.className = 'tab-arrow tab-arrow-right';
      rightBtn.innerHTML = '▶';
      rightBtn.title = '向右移动';
      rightBtn.onclick = async (e) => {
        e.stopPropagation();
        await window.electronAPI.moveCategory(cat.id, 1);
        await loadCategories();
      };
      wrap.appendChild(rightBtn);
    }

    wrap.appendChild(btn);

    const delBtn = document.createElement('button');
    delBtn.className = 'tab-delete';
    delBtn.innerHTML = '×';
    delBtn.title = '删除分类';
    delBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm(`确定删除分类"${cat.name}"？该分类下的所有任务、阶段及填报数据将被一并删除。`)) {
        doDeleteCategory(cat.id);
      }
    };

    wrap.appendChild(delBtn);
    bar.appendChild(wrap);
  });
  const addBtn = document.createElement('button');
  addBtn.className = 'tab tab-add';
  addBtn.textContent = '+';
  addBtn.title = '添加分类';
  addBtn.onclick = () => openCatModal();
  bar.appendChild(addBtn);
}

function startTabRename(cat, btn) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = cat.name;
  input.className = 'tab-edit-input';
  input.style.cssText = 'flex:1;min-width:60px;padding:4px 8px;font-size:13px;border:2px solid var(--primary);border-radius:4px;outline:none;';

  btn.replaceWith(input);
  input.focus();
  input.select();

  const finish = async () => {
    const newName = input.value.trim();
    if (newName && newName !== cat.name) {
      await window.electronAPI.updateCategory(cat.id, newName);
      await loadCategories();
      return;
    }
    input.replaceWith(btn);
  };

  input.addEventListener('blur', finish);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish();
    if (e.key === 'Escape') {
      input.value = cat.name;
      finish();
    }
  });
}

async function doDeleteCategory(id) {
  await window.electronAPI.deleteCategory(id);
  if (currentCategoryId === id) {
    currentCategoryId = null;
  }
  await loadCategories();
}

async function switchCategory(id) {
  if (currentCategoryId === id) return;
  currentCategoryId = id;
  renderTabs();
  selectedTaskIds.clear();
  updateBulkBar();
  await loadTasks(id);
}

async function loadTasks(categoryId) {
  if (!categoryId) return;
  await window.electronAPI.carryOverTasks(currentYearMonth, categoryId);
  tasks = await window.electronAPI.getTasks(categoryId, currentYearMonth);
  tasks.sort((a, b) => {
    const aDone = a.status === 'completed' ? 1 : 0;
    const bDone = b.status === 'completed' ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    const aOrder = parseInt(a.sort_order) || 0;
    const bOrder = parseInt(b.sort_order) || 0;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return new Date(b.created_at) - new Date(a.created_at);
  });
  renderTasks();
}

function renderTasks() {
  const list = $('taskList');
  list.innerHTML = '';
  const cat = categories.find(c => c.id === currentCategoryId);
  const isRoutine = cat ? cat.is_routine : false;

  if (tasks.length === 0) {
    list.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <h3>暂无任务</h3>
        <p>点击上方"新建任务"添加${isRoutine ? '日常工作项' : '任务'}</p>
      </div>`;
    return;
  }

  for (const task of tasks) {
    const card = document.createElement('div');
    card.className = 'task-card' + (task.status === 'completed' ? ' completed' : '');
    card.dataset.taskId = task.id;
    card.draggable = true;
    card.addEventListener('dragstart', onDragStart);
    card.addEventListener('dragend', onDragEnd);
    card.addEventListener('dragover', onDragOver);
    card.addEventListener('dragleave', onDragLeave);
    card.addEventListener('drop', onDrop);
    card.onclick = () => {
      if (selectedTaskIds.size > 0) {
        toggleSelectTask(task.id);
      } else {
        openTaskModal(task.id);
      }
    };

    let statusClass = 'status-' + task.status;
    let statusText = { created: '已创建', in_progress: '进行中', completed: '已完成' }[task.status] || task.status;
    let progressHtml = '';

    if (isRoutine) {
      const isEnded = task.status === 'completed';
      statusClass = isEnded ? 'status-completed' : 'status-routine';
      statusText = isEnded ? '已结束' : '日常工作';
      const rec = task.routineRecord;
      const qty = rec ? rec.quantity : (isEnded ? '—' : '未填报');
      const qtyColor = rec ? '' : (isEnded ? '' : 'color:var(--danger);');
      const descHtml = task.description
        ? `<div class="task-latest-note">📝 ${escapeHtml(task.description)}</div>`
        : '';
      progressHtml = `<div class="routine-badge" style="${qtyColor}">本月填报: ${qty}</div>${descHtml}`;
    } else {
      const pct = task.progress || 0;
      const stages = task.stages || [];
      const stageCount = stages.length;
      const filledCount = stages.filter(s => s.is_completed == 1).length;
      let latestNoteHtml = '';
      if (stages.length > 0) {
        const newestFilledStage = [...stages].reverse().find(s => s.is_completed == 1);
        if (newestFilledStage) {
          latestNoteHtml = `<div class="task-latest-note">📝 第${newestFilledStage.stage_index}段: ${escapeHtml(newestFilledStage.note)}</div>`;
        } else if (task.description) {
          latestNoteHtml = `<div class="task-latest-note">📝 ${escapeHtml(task.description)}</div>`;
        }
      } else if (task.description) {
        latestNoteHtml = `<div class="task-latest-note">📝 ${escapeHtml(task.description)}</div>`;
      }
      progressHtml = `
        <div class="task-progress">
          <div class="progress-bar"><div class="progress-fill ${task.status === 'completed' ? 'completed' : ''}" style="width:${pct}%"></div></div>
          <span>${pct}%</span>
        </div>
        <div class="task-meta">已完成: ${filledCount}/${stageCount} 段 | 创建: ${formatDateTime(task.created_at)}</div>
        ${latestNoteHtml}
      `;
    }

    const isSelected = selectedTaskIds.has(task.id);
    const actionsHtml = `
      <div class="card-actions" onclick="event.stopPropagation();">
        <div class="checkbox-wrap">
          <input type="checkbox" id="chk_${task.id}" ${isSelected ? 'checked' : ''}>
          <label for="chk_${task.id}">选择</label>
        </div>
        ${!isRoutine && task.status !== 'completed' ? `<button class="btn-action complete" data-action="complete" data-id="${task.id}">直接完成</button>` : ''}
        ${!isRoutine && task.status !== 'completed' ? `<button class="btn-action next" data-action="next" data-id="${task.id}">下一阶段</button>` : ''}
        <button class="btn-action delete" data-action="delete" data-id="${task.id}">删除</button>
      </div>
    `;

    card.innerHTML = `
      <div class="task-header">
        <div class="task-title">${escapeHtml(task.title)}</div>
        <span class="task-status ${statusClass}">${statusText}</span>
      </div>
      ${progressHtml}
      ${actionsHtml}
    `;

    card.querySelector(`#chk_${task.id}`).onchange = (e) => {
      e.stopPropagation();
      toggleSelectTask(task.id);
    };

    card.querySelectorAll('.btn-action').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const id = parseInt(btn.dataset.id);
        if (action === 'complete') handleQuickComplete(id);
        if (action === 'next') handleQuickNextStage(id);
        if (action === 'delete') handleQuickDelete(id);
      };
    });

    list.appendChild(card);
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
  const bar = $('bulkBar');
  if (selectedTaskIds.size > 0) {
    bar.style.display = 'flex';
    $('bulkCount').textContent = `已选择 ${selectedTaskIds.size} 项`;
  } else {
    bar.style.display = 'none';
  }
}

let dragSrcId = null;

function onDragStart(e) {
  const card = e.target.closest('.task-card');
  if (!card) return;
  dragSrcId = parseInt(card.dataset.taskId);
  card.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragSrcId);
}

function onDragEnd(e) {
  const card = e.target.closest('.task-card');
  if (card) card.classList.remove('dragging');
  dragSrcId = null;
  document.querySelectorAll('.task-card.drag-over').forEach(c => c.classList.remove('drag-over'));
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const card = e.target.closest('.task-card');
  if (!card || !dragSrcId) return;
  const targetId = parseInt(card.dataset.taskId);
  if (targetId === dragSrcId) return;
  const srcTask = tasks.find(t => t.id === dragSrcId);
  const tgtTask = tasks.find(t => t.id === targetId);
  if (!srcTask || !tgtTask) return;
  const srcDone = srcTask.status === 'completed' ? 1 : 0;
  const tgtDone = tgtTask.status === 'completed' ? 1 : 0;
  if (srcDone !== tgtDone) return;
  card.classList.add('drag-over');
}

function onDragLeave(e) {
  const card = e.target.closest('.task-card');
  if (card) card.classList.remove('drag-over');
}

async function onDrop(e) {
  e.preventDefault();
  const card = e.target.closest('.task-card');
  if (card) card.classList.remove('drag-over');
  if (!dragSrcId) return;
  const targetId = card ? parseInt(card.dataset.taskId) : null;
  if (!targetId || targetId === dragSrcId) { dragSrcId = null; return; }

  const srcTask = tasks.find(t => t.id === dragSrcId);
  const tgtTask = tasks.find(t => t.id === targetId);
  if (!srcTask || !tgtTask) { dragSrcId = null; return; }
  const srcDone = srcTask.status === 'completed' ? 1 : 0;
  const tgtDone = tgtTask.status === 'completed' ? 1 : 0;
  if (srcDone !== tgtDone) { dragSrcId = null; return; }

  const taskList = [...tasks];
  const srcIdx = taskList.findIndex(t => t.id === dragSrcId);
  const tgtIdx = taskList.findIndex(t => t.id === targetId);
  if (srcIdx < 0 || tgtIdx < 0) { dragSrcId = null; return; }

  taskList.splice(srcIdx, 1);
  const newTgtIdx = taskList.findIndex(t => t.id === targetId);
  taskList.splice(newTgtIdx + 1, 0, srcTask);

  tasks = taskList;
  renderTasks();

  const taskIds = tasks.map(t => t.id);
  await window.electronAPI.batchReorderTasks(currentCategoryId, taskIds);

  dragSrcId = null;
}

async function handleQuickComplete(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  await window.electronAPI.updateTask({
    id: task.id,
    title: task.title,
    description: task.description || '',
    status: 'completed',
    progress: 100
  });
  await loadTasks(currentCategoryId);
}

async function handleQuickNextStage(taskId) {
  openTaskModal(taskId);
}

async function handleQuickDelete(taskId) {
  deleteTargetId = taskId;
  deleteTargetMode = 'single';
  const task = tasks.find(t => t.id === taskId);
  $('deleteConfirmText').textContent = `确定删除任务"${task ? task.title : ''}"？此操作不可恢复。相关的所有阶段记录和填报数据将被一并删除。`;
  openDeleteModal();
}

async function handleBulkComplete() {
  for (const id of selectedTaskIds) {
    const task = tasks.find(t => t.id === id);
    if (!task || task.status === 'completed') continue;
    await window.electronAPI.updateTask({
      id: task.id,
      title: task.title,
      description: task.description || '',
      status: 'completed',
      progress: 100
    });
  }
  selectedTaskIds.clear();
  updateBulkBar();
  await loadTasks(currentCategoryId);
}

async function handleBulkDelete() {
  deleteTargetMode = 'batch';
  $('deleteConfirmText').textContent = `确定删除选中的 ${selectedTaskIds.size} 个任务？此操作不可恢复。`;
  openDeleteModal();
}

async function checkAllRoutineReminders() {
  const routineCats = categories.filter(c => c.is_routine);
  const allMissing = [];

  for (const cat of routineCats) {
    const unfilled = await window.electronAPI.checkRoutineUnfilled(cat.id, currentYearMonth);
    for (const item of unfilled) {
      allMissing.push({
        task: item.task,
        catName: cat.name,
        yearMonth: item.yearMonth || item.lastYm,
        isPriorMonth: item.isPriorMonth
      });
    }
  }

  if (allMissing.length) {
    const priorMissing = allMissing.filter(m => m.isPriorMonth);
    const curMissing = allMissing.filter(m => !m.isPriorMonth);

    let html = '';
    if (priorMissing.length) {
      html += `<p style="margin-bottom:8px;color:var(--danger);">⚠️ 上个月未填报的日常工作：</p>`;
      html += priorMissing.map(m =>
        `<li style="margin-bottom:4px;"><strong>${escapeHtml(m.catName)}</strong> - ${escapeHtml(m.task.title)} (${m.yearMonth})</li>`
      ).join('');
    }
    if (curMissing.length) {
      html += `<p style="margin:8px 0 4px;color:var(--warning);">📋 本月待填报的日常工作：</p>`;
      html += curMissing.map(m =>
        `<li style="margin-bottom:4px;"><strong>${escapeHtml(m.catName)}</strong> - ${escapeHtml(m.task.title)}</li>`
      ).join('');
    }

    $('remindList').innerHTML = html;
    $('remindText').textContent = priorMissing.length
      ? '以下日常工作上月未填报，请先补填，再刷新本月数据：'
      : '以下日常工作本月尚未填报：';
    $('remindModalOverlay').classList.add('show');

    $('btnRemindOk').onclick = async () => {
      $('remindModalOverlay').classList.remove('show');
      if (priorMissing.length) {
        const cat = categories.find(c => c.id === priorMissing[0].task.category_id);
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
  const fullTask = await window.electronAPI.getTaskById(taskId);
  if (!fullTask) return;

  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx >= 0) {
    const existingRoutineRecord = tasks[idx].routineRecord;
    tasks[idx] = { ...tasks[idx], ...fullTask };
    if (existingRoutineRecord) {
      tasks[idx].routineRecord = existingRoutineRecord;
    }
  }
  openedTask = tasks.find(t => t.id === taskId);
  if (!openedTask) return;

  $('modalOverlay').classList.add('show');
  $('taskId').value = openedTask.id;
  $('taskTitle').value = openedTask.title;
  $('taskDesc').value = openedTask.description || '';

  populateTaskCategorySelect(openedTask.category_id);

  const cat = categories.find(c => c.id === currentCategoryId);
  const isRoutine = cat ? cat.is_routine : false;

  $('routinePanel').style.display = isRoutine ? 'block' : 'none';
  $('stagePanel').style.display = isRoutine ? 'none' : 'block';
  $('statusPanel').style.display = isRoutine ? 'none' : 'block';

  $('timeCreated').textContent = formatDateTime(openedTask.created_at);
  $('timeStarted').textContent = formatDateTime(openedTask.started_at);
  $('timeCompleted').textContent = formatDateTime(openedTask.completed_at);

  updateStatusBadge(openedTask.status);
  updateStatusButtons(openedTask.status);

  if (isRoutine) {
    const isEnded = openedTask.status === 'completed';
    const rec = openedTask.routineRecord;
    $('routineQty').value = rec ? rec.quantity : '';
    $('routineLabelMonth').textContent = currentYearMonth;

    if (isEnded) {
      $('routineQty').disabled = true;
      $('btnSaveRoutine').style.display = 'none';
      $('backfillPanel').style.display = 'none';
      $('routineInfo').innerHTML = `<span style="color:var(--success);">该日常工作已于 ${formatDateTime(openedTask.completed_at)} 结束</span>`;
      $('btnEndRoutine').style.display = 'none';
      $('btnReopenRoutine').style.display = '';
      $('endRoutineInfo').style.display = 'inline';
      $('endRoutineInfo').textContent = '已结束';
    } else {
      $('routineQty').disabled = false;
      $('btnSaveRoutine').style.display = '';
      $('btnEndRoutine').style.display = '';
      $('btnReopenRoutine').style.display = 'none';
      const lastYm = getLastYearMonth(currentYearMonth);
      const lastRec = await window.electronAPI.getLastMonthRoutine(openedTask.id, currentYearMonth);
      $('routineInfo').innerHTML = lastRec
        ? `上月(${lastYm})填报: <strong>${lastRec.quantity}</strong> (已填报 ✓)`
        : `上月(${lastYm}): <span style="color:var(--danger);">未填报 ⚠️</span>`;

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
  globalNoteTimer = setTimeout(() => {
    const ta = $('taskDesc');
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
    id: openedTask.id,
    title: openedTask.title,
    description: value,
    status: openedTask.status,
    progress: openedTask.progress
  }).catch(() => {});
}

function populateTaskCategorySelect(currentCategoryId) {
  const sel = $('taskCategory');
  sel.innerHTML = '';
  for (const cat of categories) {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name;
    if (cat.id === currentCategoryId) opt.selected = true;
    sel.appendChild(opt);
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
  const qtyVal = $('routineQty');
  if (!qtyVal || qtyVal.value === '') return;
  const qty = parseFloat(qtyVal.value);
  if (isNaN(qty)) return;
  await window.electronAPI.fillRoutine({
    taskId: openedTask.id,
    yearMonth: currentYearMonth,
    quantity: qty
  });
}

function updateStatusBadge(status) {
  const map = { created: '已创建 (0%)', in_progress: '进行中', completed: '已完成 (100%)' };
  const badge = $('statusBadge');
  badge.textContent = map[status] || status;
  badge.className = 'status-badge status-' + status;
}

function updateStatusButtons(status) {
  const createdBtn = $('btnStatusCreated');
  const progressBtn = $('btnStatusProgress');
  const completeBtn = $('btnStatusComplete');
  const revertBtn = $('btnStatusRevert');

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
  const container = $('stageList');
  container.innerHTML = '';
  const stages = task.stages || [];
  if (stages.length === 0) {
    container.innerHTML = '<div class="empty-stages">暂无阶段，请在下方添加第一条阶段进度</div>';
    return;
  }
  [...stages].reverse().forEach((s) => {
    const div = document.createElement('div');
    div.className = 'stage-item';
    const isLast = s.stage_index === stages.length;
    const isFirst = s.stage_index === 1;
    const isCompleted = s.is_completed == 1;
    let statusLabel = '';
    if (isFirst && stages.length === 1) statusLabel = ' (当前阶段)';
    else if (isLast) statusLabel = ' (最新阶段)';

    div.innerHTML = `
      <div class="stage-item-main">
        <div class="stage-index">第 ${s.stage_index} 阶段${statusLabel}</div>
        <div class="stage-note" data-stage-id="${s.id}" title="点击编辑备注">${escapeHtml(s.note || '无备注')}</div>
        <div class="stage-time">创建: ${formatDateTime(s.created_at)} | 更新: ${formatDateTime(s.updated_at)}</div>
      </div>
      <label class="stage-check ${isCompleted ? 'checked' : ''}" title="${isCompleted ? '已完成' : '未完成'}">
        <input type="checkbox" class="stage-check-input" data-stage-id="${s.id}" ${isCompleted ? 'checked' : ''}>
        <span class="stage-check-mark">${isCompleted ? '✓' : '—'}</span>
      </label>
      <button class="btn-stage-delete" data-stage-id="${s.id}" title="删除阶段">×</button>
    `;

    const noteEl = div.querySelector('.stage-note');
    noteEl.addEventListener('click', (e) => {
      e.stopPropagation();
      startStageNoteEdit(s, noteEl);
    });

    const checkbox = div.querySelector('.stage-check-input');
    checkbox.addEventListener('change', async (e) => {
      e.stopPropagation();
      await window.electronAPI.updateStage({
        id: s.id,
        is_completed: checkbox.checked ? 1 : 0
      });
      await refreshOpenedTask();
      renderStages(openedTask);
      updateStatusBadge(openedTask.status);
      updateStatusButtons(openedTask.status);
    });

    div.querySelector('.btn-stage-delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (isCompleted && !confirm(`确定删除第 ${s.stage_index} 阶段？该阶段已标记为完成。`)) return;
      await window.electronAPI.deleteStage(s.id);
      await refreshOpenedTask();
      renderStages(openedTask);
      updateStatusBadge(openedTask.status);
      updateStatusButtons(openedTask.status);
    });

    container.appendChild(div);
  });
}

function startStageNoteEdit(stage, el) {
  const textarea = document.createElement('textarea');
  textarea.value = stage.note || '';
  textarea.className = 'textarea';
  textarea.style.cssText = 'font-size:14px;padding:4px 8px;min-height:60px;resize:vertical;';

  el.replaceWith(textarea);
  textarea.focus();

  const finish = async () => {
    const newNote = textarea.value.trimEnd();
    if (newNote !== (stage.note || '')) {
      await window.electronAPI.updateStage({
        id: stage.id,
        note: newNote
      });
      await refreshOpenedTask();
    }
    renderStages(openedTask);
    updateStatusBadge(openedTask.status);
    updateStatusButtons(openedTask.status);
  };

  textarea.addEventListener('blur', finish);
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      textarea.value = stage.note || '';
      finish();
    }
  });
}

$('btnStatusCreated').onclick = async () => {
  if (!openedTask) return;
  openedTask.status = 'created';
  openedTask.progress = 0;
  updateStatusBadge('created');
  updateStatusButtons('created');
  await window.electronAPI.updateTask({
    id: openedTask.id,
    title: openedTask.title,
    description: openedTask.description,
    status: 'created',
    progress: 0
  });
};

$('btnStatusProgress').onclick = async () => {
  if (!openedTask) return;
  openedTask.status = 'in_progress';
  updateStatusBadge('in_progress');
  updateStatusButtons('in_progress');
  await window.electronAPI.updateTask({
    id: openedTask.id,
    title: openedTask.title,
    description: openedTask.description,
    status: 'in_progress',
    progress: openedTask.progress
  });
};

$('btnStatusComplete').onclick = async () => {
  if (!openedTask) return;
  if (!confirm('确定直接完成该任务？各阶段进度保持不变，任务标记为已完成(100%)。')) return;
  openedTask.status = 'completed';
  openedTask.progress = 100;
  updateStatusBadge('completed');
  updateStatusButtons('completed');
  $('timeCompleted').textContent = formatDateTime(new Date().toISOString());
  await window.electronAPI.updateTask({
    id: openedTask.id,
    title: openedTask.title,
    description: openedTask.description,
    status: 'completed',
    progress: 100
  });
  await refreshOpenedTask();
  renderStages(openedTask);
};

$('btnStatusRevert').onclick = async () => {
  if (!openedTask) return;
  const stages = openedTask.stages || [];
  const filledCount = stages.filter(s => s.is_completed == 1).length;
  const avgProgress = stages.length > 0
    ? Math.round((filledCount / stages.length) * 100)
    : 0;
  openedTask.status = 'in_progress';
  openedTask.progress = avgProgress;
  updateStatusBadge('in_progress');
  updateStatusButtons('in_progress');
  $('timeCompleted').textContent = '-';
  await window.electronAPI.updateTask({
    id: openedTask.id,
    title: openedTask.title,
    description: openedTask.description,
    status: 'in_progress',
    progress: openedTask.progress
  });
  await refreshOpenedTask();
  renderStages(openedTask);
};

$('btnAddStage').onclick = async () => {
  if (!openedTask) return;
  const note = $('newStageNote').value.trim();
  await window.electronAPI.addStage({
    taskId: openedTask.id,
    note: note
  });
  $('newStageNote').value = '';
  await refreshOpenedTask();
  renderStages(openedTask);

  if (openedTask.status === 'created') {
    openedTask.status = 'in_progress';
    updateStatusBadge('in_progress');
    updateStatusButtons('in_progress');
  }
};

$('btnSaveRoutine').onclick = async () => {
  if (!openedTask) return;
  const qty = parseFloat($('routineQty').value);
  if (isNaN(qty)) return alert('请输入有效数量');
  await window.electronAPI.fillRoutine({
    taskId: openedTask.id,
    yearMonth: currentYearMonth,
    quantity: qty
  });
  await refreshOpenedTask();
  $('routineInfo').innerHTML = `本月(${currentYearMonth})已保存: <strong>${qty}</strong> ✓`;
  await loadTasks(currentCategoryId);
};

$('btnBackfillRoutine').onclick = async () => {
  if (!openedTask) return;
  const qty = parseFloat($('backfillQty').value);
  if (isNaN(qty)) return alert('请输入有效数量');
  const lastYm = getLastYearMonth(currentYearMonth);
  await window.electronAPI.fillRoutine({
    taskId: openedTask.id,
    yearMonth: lastYm,
    quantity: qty
  });
  $('backfillPanel').style.display = 'none';
  $('routineInfo').innerHTML = `上月(${lastYm})已补填: <strong>${qty}</strong> ✓`;
  await loadAllMonths();
  populateExportMonthSelects();
  await refreshOpenedTask();
  await loadTasks(currentCategoryId);
};

$('btnEndRoutine').onclick = async () => {
  if (!openedTask) return;
  if (!confirm('确定结束该日常工作？结束后，下月起将不再出现在列表中。')) return;
  await window.electronAPI.updateTask({
    id: openedTask.id,
    title: openedTask.title,
    description: openedTask.description || '',
    status: 'completed',
    progress: 100
  });
  await refreshOpenedTask();
  $('routineQty').disabled = true;
  $('btnSaveRoutine').style.display = 'none';
  $('backfillPanel').style.display = 'none';
  $('btnEndRoutine').style.display = 'none';
  $('btnReopenRoutine').style.display = '';
  $('endRoutineInfo').style.display = 'inline';
  $('endRoutineInfo').textContent = '已结束';
  $('routineInfo').innerHTML = `<span style="color:var(--success);">该日常工作已结束</span>`;
  $('timeCompleted').textContent = formatDateTime(new Date().toISOString());
  await loadTasks(currentCategoryId);
};

$('btnReopenRoutine').onclick = async () => {
  if (!openedTask) return;
  if (!confirm('确定重新开启该日常工作？')) return;
  await window.electronAPI.updateTask({
    id: openedTask.id,
    title: openedTask.title,
    description: openedTask.description || '',
    status: 'in_progress',
    progress: 0
  });
  await refreshOpenedTask();
  $('routineQty').disabled = false;
  $('routineQty').value = '';
  $('btnSaveRoutine').style.display = '';
  $('btnEndRoutine').style.display = '';
  $('btnReopenRoutine').style.display = 'none';
  $('endRoutineInfo').style.display = 'none';
  $('routineInfo').innerHTML = '';
  $('timeCompleted').textContent = '-';
  await loadTasks(currentCategoryId);
};

async function saveAndCloseTaskModal() {
  if (!openedTask) { await closeTaskModal(); return; }
  const title = $('taskTitle').value.trim();
  if (!title) { await closeTaskModal(); return; }

  const newCategoryId = parseInt($('taskCategory').value);
  if (newCategoryId && newCategoryId !== openedTask.category_id) {
    await window.electronAPI.changeTaskCategory(openedTask.id, newCategoryId);
  }

  openedTask.title = title;
  openedTask.description = $('taskDesc').value;

  await window.electronAPI.updateTask({
    id: openedTask.id,
    title: openedTask.title,
    description: openedTask.description,
    status: openedTask.status,
    progress: openedTask.progress
  });

  await closeTaskModal();
  await loadTasks(currentCategoryId);
}

$('btnSaveTask').onclick = saveAndCloseTaskModal;

$('btnDeleteTask').onclick = async () => {
  if (!openedTask) return;
  deleteTargetId = openedTask.id;
  deleteTargetMode = 'single';
  $('deleteConfirmText').textContent = `确定删除任务"${openedTask.title}"？此操作不可恢复。\n\n相关的所有阶段记录和填报数据将被一并删除。`;
  openDeleteModal();
};

async function refreshOpenedTask() {
  if (!openedTask) return;
  const refreshed = await window.electronAPI.getTaskById(openedTask.id);
  if (!refreshed) return;
  const idx = tasks.findIndex(t => t.id === openedTask.id);
  if (idx >= 0) {
    tasks[idx] = { ...tasks[idx], ...refreshed, stages: refreshed.stages, routineRecord: refreshed.routineRecord };
  }
  openedTask = tasks.find(t => t.id === openedTask.id);
}

function openNewTaskModal() {
  $('newTaskModalOverlay').classList.add('show');
  $('newTaskTitle').value = '';
  $('newTaskDesc').value = '';
  $('newTaskStageNote').value = '';
  const nowYm = getNowYearMonth();
  if (currentYearMonth === nowYm) {
    $('newTaskDate').value = new Date().toISOString().substring(0, 10);
  } else {
    $('newTaskDate').value = currentYearMonth + '-01';
  }
  const cat = categories.find(c => c.id === currentCategoryId);
  const isRoutine = cat ? cat.is_routine : false;
  $('newTaskStagePanel').style.display = isRoutine ? 'none' : 'block';
  setTimeout(() => $('newTaskTitle').focus(), 50);
}
function closeNewTaskModal() {
  $('newTaskModalOverlay').classList.remove('show');
}
$('btnAddTask').onclick = openNewTaskModal;
$('btnCloseNewTaskModal').onclick = closeNewTaskModal;
$('newTaskModalOverlay').onclick = (e) => { if (e.target === $('newTaskModalOverlay')) closeNewTaskModal(); };
$('btnConfirmNewTask').onclick = async () => {
  const title = $('newTaskTitle').value;
  if (!title || !title.trim()) return;
  const cat = categories.find(c => c.id === currentCategoryId);
  const isRoutine = cat ? cat.is_routine : false;
  const desc = $('newTaskDesc').value.trim();
  const stageNote = $('newTaskStageNote').value.trim();
  const dateVal = $('newTaskDate').value;
  const createdAt = dateVal ? new Date(dateVal + 'T00:00:00').toISOString() : undefined;
  try {
    const newTaskId = await window.electronAPI.addTask({
      categoryId: currentCategoryId,
      title: title.trim(),
      description: desc,
      status: isRoutine ? 'in_progress' : 'created',
      isRoutine: isRoutine,
      createdAt: createdAt
    });
    if (!isRoutine && stageNote) {
      await window.electronAPI.addStage({
        taskId: newTaskId,
        note: stageNote,
        progressValue: 0
      });
    }
    closeNewTaskModal();
    await loadTasks(currentCategoryId);
    await loadAllMonths();
    populateExportMonthSelects();
  } catch (e) {
    alert('创建任务失败: ' + (e.message || '未知错误'));
    console.error('addTask error:', e);
  }
};

function openCatModal() {
  $('catModalOverlay').classList.add('show');
  $('catName').value = '';
  $('catIsRoutine').checked = false;
}
function closeCatModal() {
  $('catModalOverlay').classList.remove('show');
}
$('btnAddCategory').onclick = openCatModal;
$('btnCloseCatModal').onclick = closeCatModal;
$('btnSaveCategory').onclick = async () => {
  const name = $('catName').value.trim();
  if (!name) return alert('请输入分类名称');
  const isRoutine = $('catIsRoutine').checked;
  await window.electronAPI.addCategory(name, isRoutine);
  closeCatModal();
  await loadCategories();
};

// Export modal
function openExportModal() {
  $('exportModalOverlay').classList.add('show');
  populateExportMonthSelects();
}
function closeExportModal() {
  $('exportModalOverlay').classList.remove('show');
}
$('btnExport').onclick = openExportModal;
$('btnCloseExportModal').onclick = closeExportModal;
$('exportModalOverlay').onclick = (e) => { if (e.target === $('exportModalOverlay')) closeExportModal(); };
$('btnChooseExportDir').onclick = async () => {
  const result = await window.electronAPI.showOpenDialog({
    properties: ['openDirectory']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    $('exportDirPath').value = result.filePaths[0];
  }
};
$('btnConfirmExport').onclick = async () => {
  const dirPath = $('exportDirPath').value;
  const startMonth = $('exportStartMonth').value;
  const endMonth = $('exportEndMonth').value;
  if (!dirPath) return alert('请选择导出目录');
  if (startMonth > endMonth) return alert('起始月份不能大于结束月份');
  const res = await window.electronAPI.exportMonthly(dirPath, startMonth, endMonth);
  if (res.success) {
    alert('导出成功');
    closeExportModal();
  } else {
    alert('导出失败: ' + (res.error || '未知错误'));
  }
};

// Delete modal
function openDeleteModal() {
  $('deleteModalOverlay').classList.add('show');
}
function closeDeleteModal() {
  $('deleteModalOverlay').classList.remove('show');
}
$('btnCloseDeleteModal').onclick = closeDeleteModal;
$('btnCancelDelete').onclick = closeDeleteModal;
$('deleteModalOverlay').onclick = (e) => { if (e.target === $('deleteModalOverlay')) closeDeleteModal(); };
$('btnConfirmDelete').onclick = async () => {
  closeDeleteModal();
  if (deleteTargetMode === 'single') {
    if (deleteTargetId) {
      await window.electronAPI.deleteTask(deleteTargetId);
      if (openedTask && openedTask.id === deleteTargetId) {
        closeTaskModal();
      }
      await loadTasks(currentCategoryId);
    }
  } else if (deleteTargetMode === 'batch') {
    for (const id of selectedTaskIds) {
      await window.electronAPI.deleteTask(id);
    }
    selectedTaskIds.clear();
    updateBulkBar();
    await loadTasks(currentCategoryId);
  }
  deleteTargetId = null;
};

// Month select
$('yearSelect').onchange = () => switchMonthFromSelects();
$('monthSelect').onchange = () => switchMonthFromSelects();

function switchMonthFromSelects() {
  const year = $('yearSelect').value;
  const month = $('monthSelect').value;
  if (year && month) {
    const ym = `${year}-${month}`;
    if (ym !== currentYearMonth) {
      switchMonth(ym);
    }
  }
}

// Bulk actions
$('btnBulkComplete').onclick = handleBulkComplete;
$('btnBulkDelete').onclick = handleBulkDelete;
$('btnBulkMove').onclick = openBulkMoveModal;
$('btnBulkCancel').onclick = () => {
  selectedTaskIds.clear();
  updateBulkBar();
  renderTasks();
};

$('modalOverlay').onclick = (e) => { if (e.target === $('modalOverlay')) saveAndCloseTaskModal(); };
$('catModalOverlay').onclick = (e) => { if (e.target === $('catModalOverlay')) closeCatModal(); };
$('btnCloseModal').onclick = closeTaskModal;

// Overview modal
$('btnOverview').onclick = openOverviewModal;
$('btnCloseOverviewModal').onclick = closeOverviewModal;
$('overviewModalOverlay').onclick = (e) => { if (e.target === $('overviewModalOverlay')) closeOverviewModal(); };

function openOverviewModal() {
  $('overviewModalOverlay').classList.add('show');
  populateOverviewYearSelect();
  loadOverviewData();
}

function closeOverviewModal() {
  $('overviewModalOverlay').classList.remove('show');
}

function populateOverviewYearSelect() {
  const sel = $('overviewYearSelect');
  sel.innerHTML = '';
  const currentYear = new Date().getFullYear();
  for (let y = currentYear - 5; y <= currentYear + 1; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y + '年' + (y === currentYear ? ' (当前)' : '');
    sel.appendChild(opt);
  }
  sel.value = currentYear;
  sel.onchange = () => loadOverviewData();
}

async function loadOverviewData() {
  const year = parseInt($('overviewYearSelect').value);
  const data = await window.electronAPI.getAllTasksByYear(year);
  const grid = $('overviewGrid');
  grid.innerHTML = '';

  const months = [
    '1月', '2月', '3月', '4月', '5月', '6月',
    '7月', '8月', '9月', '10月', '11月', '12月'
  ];

  for (let m = 1; m <= 12; m++) {
    const ym = `${year}-${String(m).padStart(2, '0')}`;
    const tasksForMonth = data[ym] || [];
    const card = document.createElement('div');
    card.className = 'overview-month-card';

    if (tasksForMonth.length === 0) {
      card.innerHTML = `<h3>${months[m - 1]}</h3><div class="overview-month-empty">无任务</div>`;
    } else {
      let itemsHtml = '';
      for (const t of tasksForMonth) {
        let dotClass = t.is_routine ? 'routine' : t.status;
        itemsHtml += `
          <div class="overview-task-item" data-task-id="${t.id}" data-category-id="${t.categoryId}"
               data-year-month="${ym}" title="${escapeHtml(t.title)}">
            <span class="overview-task-dot ${dotClass}"></span>
            <span class="overview-task-title">${escapeHtml(t.title)}</span>
          </div>`;
      }
      card.innerHTML = `<h3>${months[m - 1]} (${tasksForMonth.length})</h3><div class="overview-task-list">${itemsHtml}</div>`;
    }

    card.querySelectorAll('.overview-task-item').forEach(item => {
      item.addEventListener('click', () => {
        const taskId = parseInt(item.dataset.taskId);
        const categoryId = parseInt(item.dataset.categoryId);
        const ym = item.dataset.yearMonth;
        closeOverviewModal();
        if (currentCategoryId !== categoryId) {
          currentCategoryId = categoryId;
          renderTabs();
        }
        currentYearMonth = ym;
        $('yearSelect').value = ym.substring(0, 4);
        $('monthSelect').value = ym.substring(5);
        loadTasks(currentCategoryId).then(() => {
          openTaskModal(taskId);
        });
      });
    });

    grid.appendChild(card);
  }
}

// Bulk move category modal
function openBulkMoveModal() {
  $('bulkMoveText').textContent = `将选中的 ${selectedTaskIds.size} 个任务切换到以下分类：`;
  const sel = $('bulkMoveCategory');
  sel.innerHTML = '';
  for (const cat of categories) {
    if (cat.id === currentCategoryId) continue;
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name;
    sel.appendChild(opt);
  }
  $('bulkMoveModalOverlay').classList.add('show');
}

function closeBulkMoveModal() {
  $('bulkMoveModalOverlay').classList.remove('show');
}

$('btnCloseBulkMoveModal').onclick = closeBulkMoveModal;
$('bulkMoveModalOverlay').onclick = (e) => { if (e.target === $('bulkMoveModalOverlay')) closeBulkMoveModal(); };
$('btnConfirmBulkMove').onclick = async () => {
  const newCategoryId = parseInt($('bulkMoveCategory').value);
  if (!newCategoryId) return;
  await window.electronAPI.bulkChangeTaskCategory([...selectedTaskIds], newCategoryId);
  selectedTaskIds.clear();
  updateBulkBar();
  closeBulkMoveModal();
  await loadTasks(currentCategoryId);
};

// Settings modal
let pendingImportData = null;

function openSettingsModal() {
  $('settingsModalOverlay').classList.add('show');
  loadSettingsInfo();
}

function closeSettingsModal() {
  $('settingsModalOverlay').classList.remove('show');
}

async function loadSettingsInfo() {
  const isWeb = typeof window.electronAPI.getVersion === 'function';
  if (isWeb) {
    try {
      const ver = await window.electronAPI.getVersion();
      const schema = await window.electronAPI.getDbSchemaVersion();
      $('settingsVersion').textContent = ver;
      $('settingsDbSchema').textContent = schema;
    } catch (e) {
      $('settingsVersion').textContent = '1.1.0';
      $('settingsDbSchema').textContent = '1';
    }
    $('settingsPlatform').textContent = 'Web (浏览器)';
  } else {
    $('settingsVersion').textContent = '1.1.0';
    $('settingsDbSchema').textContent = '1';
    $('settingsPlatform').textContent = 'Electron';
  }
}

$('btnSettings').onclick = openSettingsModal;
$('btnCloseSettingsModal').onclick = closeSettingsModal;
$('settingsModalOverlay').onclick = (e) => { if (e.target === $('settingsModalOverlay')) closeSettingsModal(); };

$('btnExportDB').onclick = async () => {
  const isWeb = typeof window.electronAPI.getVersion === 'function';
  if (isWeb) {
    closeSettingsModal();
    await window.electronAPI.exportExcelDB();
  } else {
    const result = await window.electronAPI.showSaveDialog({
      title: '导出数据备份',
      defaultPath: `SparkTodo_备份_${new Date().toISOString().substring(0, 10)}.xlsx`,
      filters: [{ name: 'Excel 文件', extensions: ['xlsx'] }]
    });
    if (!result.canceled && result.filePath) {
      const res = await window.electronAPI.exportExcelDB(result.filePath);
      if (res.success) {
        alert('数据备份导出成功！');
        closeSettingsModal();
      } else {
        alert('导出失败: ' + (res.error || '未知错误'));
      }
    }
  }
};

$('btnImportDB').onclick = async () => {
  const isWeb = typeof window.electronAPI.getVersion === 'function';
  if (isWeb) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      closeSettingsModal();
      try {
        const parsed = await window.electronAPI.importExcelDB(file);
        pendingImportData = parsed.data;
        showImportConfirm(parsed);
      } catch (err) {
        alert('文件读取失败: ' + err.message);
      }
    };
    input.click();
  } else {
    const result = await window.electronAPI.showOpenDialog({
      title: '选择数据备份文件',
      filters: [{ name: 'Excel 文件', extensions: ['xlsx'] }],
      properties: ['openFile']
    });
    if (!result.canceled && result.filePaths.length > 0) {
      closeSettingsModal();
      try {
        const parsed = await window.electronAPI.importExcelDB(result.filePaths[0]);
        pendingImportData = parsed.data;
        showImportConfirm(parsed);
      } catch (err) {
        alert('文件读取失败: ' + err.message);
      }
    }
  }
};

function showImportConfirm(parsed) {
  const catCount = parsed.data.categories ? parsed.data.categories.length : 0;
  const taskCount = parsed.data.tasks ? parsed.data.tasks.length : 0;
  const stageCount = parsed.data.stages ? parsed.data.stages.length : 0;

  $('importConfirmBody').innerHTML = `
    <p>检测到数据文件：</p>
    <div class="about-info" style="margin:10px 0;">
      <p>📦 文件版本: <strong>${parsed.version}</strong></p>
      <p>📐 数据架构: <strong>v${parsed.schemaVersion}</strong></p>
      <p>📂 分类: <strong>${catCount}</strong> 个</p>
      <p>📋 任务: <strong>${taskCount}</strong> 条</p>
      <p>📝 阶段: <strong>${stageCount}</strong> 条</p>
    </div>
    <p style="color:var(--text-secondary);font-size:13px;">请选择导入方式：</p>
  `;

  $('importConfirmModalOverlay').classList.add('show');
}

function closeImportConfirm() {
  $('importConfirmModalOverlay').classList.remove('show');
  pendingImportData = null;
}

$('btnCloseImportConfirmModal').onclick = closeImportConfirm;
$('btnImportCancel').onclick = closeImportConfirm;
$('importConfirmModalOverlay').onclick = (e) => { if (e.target === $('importConfirmModalOverlay')) closeImportConfirm(); };

$('btnImportReplace').onclick = async () => {
  if (!pendingImportData) return;
  closeImportConfirm();
  try {
    await window.electronAPI.importData(pendingImportData, 'replace');
    alert('数据已导入（替换模式），正在刷新...');
    await loadCategories();
    if (currentCategoryId) await loadTasks(currentCategoryId);
    await loadAllMonths();
    populateExportMonthSelects();
  } catch (err) {
    alert('导入失败: ' + err.message);
  }
};

$('btnImportMerge').onclick = async () => {
  if (!pendingImportData) return;
  closeImportConfirm();
  try {
    await window.electronAPI.importData(pendingImportData, 'merge');
    alert('数据已导入（合并模式），正在刷新...');
    await loadCategories();
    if (currentCategoryId) await loadTasks(currentCategoryId);
    await loadAllMonths();
    populateExportMonthSelects();
  } catch (err) {
    alert('导入失败: ' + err.message);
  }
};

init();
