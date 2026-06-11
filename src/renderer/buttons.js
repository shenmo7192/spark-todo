// Status button, stage/routine button event bindings

$('btnStatusCreated').onclick = async function() {
  if (!openedTask) return;
  openedTask.status = 'created';
  openedTask.progress = 0;
  updateStatusBadge('created');
  updateStatusButtons('created');
  await window.electronAPI.updateTask({
    id: openedTask.id, title: openedTask.title, description: openedTask.description,
    status: 'created', progress: 0
  });
};

$('btnStatusProgress').onclick = async function() {
  if (!openedTask) return;
  openedTask.status = 'in_progress';
  updateStatusBadge('in_progress');
  updateStatusButtons('in_progress');
  await window.electronAPI.updateTask({
    id: openedTask.id, title: openedTask.title, description: openedTask.description,
    status: 'in_progress', progress: openedTask.progress
  });
};

$('btnStatusComplete').onclick = async function() {
  if (!openedTask) return;
  if (!confirm('确定直接完成该任务？各阶段进度保持不变，任务标记为已完成(100%)。')) return;
  openedTask.status = 'completed';
  openedTask.progress = 100;
  updateStatusBadge('completed');
  updateStatusButtons('completed');
  $('timeCompleted').textContent = formatDateTime(new Date().toISOString());
  await window.electronAPI.updateTask({
    id: openedTask.id, title: openedTask.title, description: openedTask.description,
    status: 'completed', progress: 100
  });
  await refreshOpenedTask();
  renderStages(openedTask);
};

$('btnStatusRevert').onclick = async function() {
  if (!openedTask) return;
  var stages = openedTask.stages || [];
  var filledCount = stages.filter(function(s) { return s.is_completed == 1; }).length;
  var avgProgress = stages.length > 0 ? Math.round((filledCount / stages.length) * 100) : 0;
  openedTask.status = 'in_progress';
  openedTask.progress = avgProgress;
  updateStatusBadge('in_progress');
  updateStatusButtons('in_progress');
  $('timeCompleted').textContent = '-';
  await window.electronAPI.updateTask({
    id: openedTask.id, title: openedTask.title, description: openedTask.description,
    status: 'in_progress', progress: openedTask.progress
  });
  await refreshOpenedTask();
  renderStages(openedTask);
};

$('btnAddStage').onclick = async function() {
  if (!openedTask) return;
  var note = $('newStageNote').value.trim();
  await window.electronAPI.addStage({ taskId: openedTask.id, note: note });
  $('newStageNote').value = '';
  await refreshOpenedTask();
  renderStages(openedTask);
  if (openedTask.status === 'created') {
    openedTask.status = 'in_progress';
    updateStatusBadge('in_progress');
    updateStatusButtons('in_progress');
  }
};

$('btnSaveRoutine').onclick = async function() {
  if (!openedTask) return;
  var qty = parseFloat($('routineQty').value);
  if (isNaN(qty)) return alert('请输入有效数量');
  await window.electronAPI.fillRoutine({ taskId: openedTask.id, yearMonth: currentYearMonth, quantity: qty });
  await refreshOpenedTask();
  $('routineInfo').innerHTML = '本月(' + currentYearMonth + ')已保存: <strong>' + qty + '</strong> \u2713';
  await loadTasks(currentCategoryId);
};

$('btnBackfillRoutine').onclick = async function() {
  if (!openedTask) return;
  var qty = parseFloat($('backfillQty').value);
  if (isNaN(qty)) return alert('请输入有效数量');
  var lastYm = getLastYearMonth(currentYearMonth);
  await window.electronAPI.fillRoutine({ taskId: openedTask.id, yearMonth: lastYm, quantity: qty });
  $('backfillPanel').style.display = 'none';
  $('routineInfo').innerHTML = '上月(' + lastYm + ')已补填: <strong>' + qty + '</strong> \u2713';
  await loadAllMonths();
  populateExportMonthSelects();
  await refreshOpenedTask();
  await loadTasks(currentCategoryId);
};

$('btnEndRoutine').onclick = async function() {
  if (!openedTask) return;
  if (!confirm('确定结束该日常工作？结束后，下月起将不再出现在列表中。')) return;
  await window.electronAPI.updateTask({
    id: openedTask.id, title: openedTask.title, description: openedTask.description || '',
    status: 'completed', progress: 100
  });
  await refreshOpenedTask();
  $('routineQty').disabled = true;
  $('btnSaveRoutine').style.display = 'none';
  $('backfillPanel').style.display = 'none';
  $('btnEndRoutine').style.display = 'none';
  $('btnReopenRoutine').style.display = '';
  $('endRoutineInfo').style.display = 'inline';
  $('endRoutineInfo').textContent = '已结束';
  $('routineInfo').innerHTML = '<span style="color:var(--success);">该日常工作已结束</span>';
  $('timeCompleted').textContent = formatDateTime(new Date().toISOString());
  await loadTasks(currentCategoryId);
};

$('btnReopenRoutine').onclick = async function() {
  if (!openedTask) return;
  if (!confirm('确定重新开启该日常工作？')) return;
  await window.electronAPI.updateTask({
    id: openedTask.id, title: openedTask.title, description: openedTask.description || '',
    status: 'in_progress', progress: 0
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
