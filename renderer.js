let categories = [];
let currentCategoryId = null;
let currentYearMonth = '';
let tasks = [];
let openedTask = null;

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
  $('currentMonth').textContent = currentYearMonth;
  await loadCategories();
  await checkAllRoutineReminders();
}

async function loadCategories() {
  categories = await window.electronAPI.getCategories();
  renderTabs();
  if (categories.length && !currentCategoryId) {
    currentCategoryId = categories[0].id;
  }
  if (currentCategoryId) {
    await loadTasks(currentCategoryId);
  }
}

function renderTabs() {
  const bar = $('tabBar');
  bar.innerHTML = '';
  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'tab' + (cat.id === currentCategoryId ? ' active' : '');
    btn.textContent = cat.name;
    btn.onclick = () => switchCategory(cat.id);
    bar.appendChild(btn);
  });
  const addBtn = document.createElement('button');
  addBtn.className = 'tab tab-add';
  addBtn.textContent = '+';
  addBtn.title = '添加分类';
  addBtn.onclick = () => openCatModal();
  bar.appendChild(addBtn);
}

async function switchCategory(id) {
  currentCategoryId = id;
  renderTabs();
  await loadTasks(id);
}

async function loadTasks(categoryId) {
  tasks = await window.electronAPI.getTasks(categoryId, currentYearMonth);
  tasks.sort((a, b) => {
    const aDone = a.status === 'completed' ? 1 : 0;
    const bDone = b.status === 'completed' ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
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
    card.onclick = () => openTaskModal(task.id);

    let statusClass = 'status-' + task.status;
    let statusText = { created: '已创建', in_progress: '进行中', completed: '已完成' }[task.status] || task.status;
    let progressHtml = '';

    if (isRoutine) {
      statusClass = 'status-routine';
      statusText = '日常工作';
      const rec = task.routineRecord;
      const qty = rec ? rec.quantity : '未填报';
      const qtyColor = rec ? '' : 'color:var(--danger);';
      progressHtml = `<div class="routine-badge" style="${qtyColor}">本月填报: ${qty}</div>`;
    } else {
      const pct = task.progress || 0;
      const stages = task.stages || [];
      const stageCount = stages.length;
      progressHtml = `
        <div class="task-progress">
          <div class="progress-bar"><div class="progress-fill ${task.status === 'completed' ? 'completed' : ''}" style="width:${pct}%"></div></div>
          <span>${pct}%</span>
        </div>
        <div class="task-meta">阶段: ${stageCount}段 | 创建: ${formatDateTime(task.created_at)}</div>
      `;
    }

    card.innerHTML = `
      <div class="task-header">
        <div class="task-title">${escapeHtml(task.title)}</div>
        <span class="task-status ${statusClass}">${statusText}</span>
      </div>
      ${progressHtml}
    `;
    list.appendChild(card);
  }
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
    tasks[idx] = { ...tasks[idx], ...fullTask };
  }
  openedTask = tasks.find(t => t.id === taskId);
  if (!openedTask) return;

  $('modalOverlay').classList.add('show');
  $('taskId').value = openedTask.id;
  $('taskTitle').value = openedTask.title;
  $('taskDesc').value = openedTask.description || '';

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
    const rec = openedTask.routineRecord;
    $('routineQty').value = rec ? rec.quantity : '';
    $('routineLabelMonth').textContent = currentYearMonth;

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

function closeTaskModal() {
  $('modalOverlay').classList.remove('show');
  openedTask = null;
  clearTimeout(globalNoteTimer);
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

  createdBtn.className = 'btn btn-sm' + (status === 'created' ? ' active-btn' : '');
  progressBtn.className = 'btn btn-sm' + (status === 'in_progress' ? ' active-btn' : '');
  completeBtn.className = 'btn btn-sm' + (status === 'completed' ? ' active-btn btn-complete-active' : '');

  if (status === 'completed') {
    $('btnStatusCreated').disabled = true;
    $('btnStatusProgress').disabled = true;
    $('btnStatusComplete').disabled = true;
  } else {
    $('btnStatusCreated').disabled = false;
    $('btnStatusProgress').disabled = false;
    $('btnStatusComplete').disabled = false;
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
    let statusLabel = '';
    if (isFirst && stages.length === 1) statusLabel = ' (当前阶段)';
    else if (isLast) statusLabel = ' (最新阶段)';

    div.innerHTML = `
      <div class="stage-item-main">
        <div class="stage-index">第 ${s.stage_index} 阶段${statusLabel}</div>
        <div class="stage-note">${escapeHtml(s.note || '无备注')}</div>
        <div class="stage-time">创建: ${formatDateTime(s.created_at)} | 更新: ${formatDateTime(s.updated_at)}</div>
      </div>
      <div class="stage-progress">${s.progress_value}%</div>
    `;
    container.appendChild(div);
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
  if (!confirm('确定直接完成该任务？所有阶段进度将会自动均分。')) return;
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

$('btnAddStage').onclick = async () => {
  if (!openedTask) return;
  const note = $('newStageNote').value.trim();
  if (!note) return alert('请输入阶段备注 / 状态更新内容');
  await window.electronAPI.addStage({
    taskId: openedTask.id,
    note: note,
    progressValue: 0
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
  await refreshOpenedTask();
  await loadTasks(currentCategoryId);
};

$('btnSaveTask').onclick = async () => {
  if (!openedTask) return;
  const title = $('taskTitle').value.trim();
  if (!title) return alert('请输入任务名称');

  openedTask.title = title;
  openedTask.description = $('taskDesc').value;

  await window.electronAPI.updateTask({
    id: openedTask.id,
    title: openedTask.title,
    description: openedTask.description,
    status: openedTask.status,
    progress: openedTask.progress
  });

  closeTaskModal();
  await loadTasks(currentCategoryId);
};

$('btnDeleteTask').onclick = async () => {
  if (!openedTask) return;
  if (!confirm(`确定删除任务"${openedTask.title}"？此操作不可恢复。\n\n相关的所有阶段记录和填报数据将被一并删除。`)) return;
  await window.electronAPI.deleteTask(openedTask.id);
  closeTaskModal();
  await loadTasks(currentCategoryId);
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

$('btnAddTask').onclick = async () => {
  const title = prompt('请输入任务名称:');
  if (!title || !title.trim()) return;
  const cat = categories.find(c => c.id === currentCategoryId);
  const isRoutine = cat ? cat.is_routine : false;
  await window.electronAPI.addTask({
    categoryId: currentCategoryId,
    title: title.trim(),
    description: '',
    status: isRoutine ? 'in_progress' : 'created',
    isRoutine: isRoutine
  });
  await loadTasks(currentCategoryId);
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

$('btnExport').onclick = async () => {
  const result = await window.electronAPI.showSaveDialog({
    defaultPath: `工单台账_${currentYearMonth}.xlsx`,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }]
  });
  if (!result.canceled && result.filePath) {
    const res = await window.electronAPI.exportExcel(result.filePath);
    if (res.success) {
      alert('导出成功: ' + result.filePath);
    } else {
      alert('导出失败: ' + (res.error || '未知错误'));
    }
  }
};

$('modalOverlay').onclick = (e) => { if (e.target === $('modalOverlay')) closeTaskModal(); };
$('catModalOverlay').onclick = (e) => { if (e.target === $('catModalOverlay')) closeCatModal(); };
$('btnCloseModal').onclick = closeTaskModal;

init();
