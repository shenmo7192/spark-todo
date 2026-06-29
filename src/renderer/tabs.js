// Topic & category tab management

function isCategoryVisibleForMonth(cat, yearMonth) {
  if (!yearMonth) return true;
  if (!cat.ended_at) return true;
  var endedYm = cat.ended_at.substring(0, 7);
  return endedYm >= yearMonth;
}

async function loadTopics() {
  topics = await window.electronAPI.getTopics();
  if (topics.length && !currentTopicId) {
    currentTopicId = topics[0].id;
  }
  // Fetch all categories for topic badge counts (done here once at init)
  try {
    allCategories = await window.electronAPI.getCategories();
    allCategories = allCategories.filter(function(c) { return isCategoryVisibleForMonth(c, currentYearMonth); });
  } catch(e) { allCategories = []; }
  renderTopicTabs();
  await loadCategories(currentTopicId);
}

function renderTopicTabs() {
  var bar = $('topicBar');
  bar.innerHTML = '';
  topics.forEach(function(topic, idx) {
    var wrap = document.createElement('div');
    wrap.className = 'topic-wrap';

    if (idx > 0) {
      var leftBtn = document.createElement('button');
      leftBtn.className = 'tab-arrow topic-arrow-left';
      leftBtn.innerHTML = '&#9664;';
      leftBtn.title = '向左移动';
      leftBtn.onclick = async function(e) {
        e.stopPropagation();
        await window.electronAPI.moveTopic(topic.id, -1);
        await loadTopics();
      };
      wrap.appendChild(leftBtn);
    }

    if (idx < topics.length - 1) {
      var rightBtn = document.createElement('button');
      rightBtn.className = 'tab-arrow topic-arrow-right';
      rightBtn.innerHTML = '&#9654;';
      rightBtn.title = '向右移动';
      rightBtn.onclick = async function(e) {
        e.stopPropagation();
        await window.electronAPI.moveTopic(topic.id, 1);
        await loadTopics();
      };
      wrap.appendChild(rightBtn);
    }

    var btn = document.createElement('button');
    btn.className = 'topic' + (topic.id === currentTopicId ? ' active' : '');
    btn.textContent = topic.name;
    btn.onclick = function() { switchTopic(topic.id); };

    // Show pending count badge
    var topicCats = allCategories.filter(function(c) { return c.topic_id === topic.id; });
    var topicCount = 0;
    for (var i = 0; i < topicCats.length; i++) {
      topicCount += (pendingCounts[topicCats[i].id] || 0);
    }
    if (topicCount > 0) {
      var badge = document.createElement('span');
      badge.className = 'tab-count-badge';
      badge.textContent = topicCount;
      btn.appendChild(badge);
    }

    btn.addEventListener('dblclick', function(e) {
      e.stopPropagation();
      startTopicRename(topic, btn);
    });

    wrap.appendChild(btn);

    var delBtn = document.createElement('button');
    delBtn.className = 'topic-delete';
    delBtn.innerHTML = '&#xD7;';
    delBtn.title = '删除专题';
    delBtn.onclick = async function(e) {
      e.stopPropagation();
      await handleDeleteTopic(topic.id);
    };

    wrap.appendChild(delBtn);
    bar.appendChild(wrap);
  });
  var addBtn = document.createElement('button');
  addBtn.className = 'topic topic-add';
  addBtn.textContent = '+';
  addBtn.title = '添加专题';
  addBtn.onclick = function() { openTopicModal(); };
  bar.appendChild(addBtn);
}

async function switchTopic(id) {
  if (currentTopicId === id) return;
  currentTopicId = id;
  currentCategoryId = null;
  selectedTaskIds.clear();
  updateBulkBar();
  renderTopicTabs();
  await loadCategories(id);
}

function startTopicRename(topic, btn) {
  var input = document.createElement('input');
  input.type = 'text';
  input.value = topic.name;
  input.className = 'tab-edit-input';
  input.style.cssText = 'flex:1;min-width:60px;padding:4px 8px;font-size:13px;border:2px solid var(--primary);border-radius:4px;outline:none;';

  btn.replaceWith(input);
  input.focus();
  input.select();

  var finish = async function() {
    var newName = input.value.trim();
    if (newName && newName !== topic.name) {
      await window.electronAPI.updateTopic(topic.id, newName);
      await loadTopics();
      return;
    }
    input.replaceWith(btn);
  };

  input.addEventListener('blur', finish);
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') finish();
    if (e.key === 'Escape') {
      input.value = topic.name;
      finish();
    }
  });
}

async function handleDeleteTopic(id) {
  if (topics.length <= 1) {
    alert('至少保留一个专题');
    return;
  }
  var topic = topics.find(function(t) { return t.id === id; });
  if (!confirm('确定删除专题"' + topic.name + '"? 该专题下的分类将自动转移到第一个可用专题。')) return;
  try {
    await window.electronAPI.deleteTopic(id);
    if (currentTopicId === id) {
      currentTopicId = null;
      currentCategoryId = null;
    }
    await loadTopics();
  } catch (e) {
    alert('删除专题失败: ' + (e.message || '未知错误'));
  }
}

async function loadCategories(topicId) {
  var topicCategories = await window.electronAPI.getCategories(topicId);
  categories = topicCategories.filter(function(c) { return isCategoryVisibleForMonth(c, currentYearMonth); });
  if (categories.length && (!currentCategoryId || !categories.find(function(c) { return c.id === currentCategoryId; }))) {
    currentCategoryId = categories[0].id;
  }
  if (!categories.length) {
    currentCategoryId = null;
    tasks = [];
  }
  // Refresh pending counts and all categories for badges
  try {
    allCategories = await window.electronAPI.getCategories();
    allCategories = allCategories.filter(function(c) { return isCategoryVisibleForMonth(c, currentYearMonth); });
    pendingCounts = await window.electronAPI.getCategoryPendingCounts();
  } catch(e) { pendingCounts = {}; }
  renderTabs();
  renderTopicTabs();
  if (currentCategoryId) {
    await loadTasks(currentCategoryId);
  } else {
    renderTasks();
  }
}

function renderTabs() {
  var bar = $('tabBar');
  bar.innerHTML = '';
  categories.forEach(function(cat, idx) {
    var wrap = document.createElement('div');
    wrap.className = 'tab-wrap';

    var isEnded = !!cat.ended_at;
    var btn = document.createElement('button');
    btn.className = 'tab' + (cat.id === currentCategoryId ? ' active' : '') + (isEnded ? ' ended' : '');
    btn.textContent = cat.name;
    btn.title = isEnded ? '该分类已结束，下个月起不再显示' : '';
    btn.onclick = function() { switchCategory(cat.id); };

    // Show pending count badge
    var catCount = pendingCounts[cat.id] || 0;
    if (catCount > 0) {
      var countBadge = document.createElement('span');
      countBadge.className = 'tab-count-badge';
      countBadge.textContent = catCount;
      btn.appendChild(countBadge);
    }

    btn.addEventListener('dblclick', function(e) {
      e.stopPropagation();
      startTabRename(cat, btn);
    });

    btn.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      e.stopPropagation();
      openCategoryContextMenu(cat, e.clientX, e.clientY);
    });

    if (idx > 0) {
      var leftBtn = document.createElement('button');
      leftBtn.className = 'tab-arrow tab-arrow-left';
      leftBtn.innerHTML = '&#9664;';
      leftBtn.title = '向左移动';
      leftBtn.onclick = async function(e) {
        e.stopPropagation();
        await window.electronAPI.moveCategory(cat.id, -1);
        await loadCategories(currentTopicId);
      };
      wrap.appendChild(leftBtn);
    }

    if (idx < categories.length - 1) {
      var rightBtn = document.createElement('button');
      rightBtn.className = 'tab-arrow tab-arrow-right';
      rightBtn.innerHTML = '&#9654;';
      rightBtn.title = '向右移动';
      rightBtn.onclick = async function(e) {
        e.stopPropagation();
        await window.electronAPI.moveCategory(cat.id, 1);
        await loadCategories(currentTopicId);
      };
      wrap.appendChild(rightBtn);
    }

    wrap.appendChild(btn);

    var delBtn = document.createElement('button');
    delBtn.className = 'tab-delete';
    delBtn.innerHTML = '&#xD7;';
    delBtn.title = '删除分类';
    delBtn.onclick = function(e) {
      e.stopPropagation();
      if (confirm('确定删除分类"' + cat.name + '"? 该分类下的所有任务、阶段及填报数据将被一并删除。')) {
        doDeleteCategory(cat.id);
      }
    };

    wrap.appendChild(delBtn);
    bar.appendChild(wrap);
  });
  var addBtn = document.createElement('button');
  addBtn.className = 'tab tab-add';
  addBtn.textContent = '+';
  addBtn.title = '添加分类';
  addBtn.onclick = function() { openCatModal(); };
  bar.appendChild(addBtn);
}

function startTabRename(cat, btn) {
  var input = document.createElement('input');
  input.type = 'text';
  input.value = cat.name;
  input.className = 'tab-edit-input';
  input.style.cssText = 'flex:1;min-width:60px;padding:4px 8px;font-size:13px;border:2px solid var(--primary);border-radius:4px;outline:none;';

  btn.replaceWith(input);
  input.focus();
  input.select();

  var finish = async function() {
    var newName = input.value.trim();
    if (newName && newName !== cat.name) {
      await window.electronAPI.updateCategory(cat.id, newName);
      await loadCategories(currentTopicId);
      return;
    }
    input.replaceWith(btn);
  };

  input.addEventListener('blur', finish);
  input.addEventListener('keydown', function(e) {
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
  await loadCategories(currentTopicId);
}

async function switchCategory(id) {
  if (currentCategoryId === id) return;
  currentCategoryId = id;
  renderTabs();
  selectedTaskIds.clear();
  updateBulkBar();
  await loadTasks(id);
}

// ---------- Category context menu ----------

function openCategoryContextMenu(cat, x, y) {
  closeCategoryContextMenu();

  var menu = document.createElement('div');
  menu.id = 'categoryContextMenu';
  menu.className = 'category-context-menu';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  var items = [];

  items.push({
    label: '切换专题',
    action: function() { openMoveCatTopicModal(cat); }
  });

  if (cat.ended_at) {
    items.push({
      label: '重新启用分类',
      action: async function() {
        await window.electronAPI.reopenCategory(cat.id);
        await loadCategories(currentTopicId);
        showToast('分类已重新启用', 'success');
      }
    });
  } else {
    items.push({
      label: '结束分类',
      action: async function() {
        if (!confirm('确定结束分类"' + cat.name + '"? 结束后该分类将在下个月起不再显示。\n\n注意：仅当分类下所有任务都已结束时才能结束分类。')) return;
        try {
          await window.electronAPI.endCategory(cat.id);
          await loadCategories(currentTopicId);
          showToast('分类已结束，下个月起不再显示', 'success');
        } catch (e) {
          alert(e.message || '结束分类失败');
        }
      }
    });
  }

  items.push({
    label: '删除分类',
    danger: true,
    action: function() {
      if (confirm('确定删除分类"' + cat.name + '"? 该分类下的所有任务、阶段及填报数据将被一并删除。')) {
        doDeleteCategory(cat.id);
      }
    }
  });

  items.forEach(function(item) {
    var row = document.createElement('div');
    row.className = 'category-context-menu-item' + (item.danger ? ' danger' : '');
    row.textContent = item.label;
    row.onclick = function(e) {
      e.stopPropagation();
      closeCategoryContextMenu();
      item.action();
    };
    menu.appendChild(row);
  });

  document.body.appendChild(menu);

  // Adjust if menu goes off screen
  var rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = (window.innerHeight - rect.height - 8) + 'px';
  }
}

function closeCategoryContextMenu() {
  var existing = $('categoryContextMenu');
  if (existing) existing.remove();
}

document.addEventListener('click', function(e) {
  var menu = $('categoryContextMenu');
  if (menu && !menu.contains(e.target)) {
    closeCategoryContextMenu();
  }
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeCategoryContextMenu();
});
