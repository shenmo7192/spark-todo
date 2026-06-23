// Category CRUD operations

const { SHEETS } = require('./core');

module.exports = {
  getCategories: function(topicId) {
    const topics = this.getTopics();
    const firstTopicId = topics.length > 0 ? topics[0].id : null;
    let all = this._sheetToJson(SHEETS.categories).map(function(r) {
      return { id: r[0], name: r[1], is_routine: r[2], sort_order: r[3], created_at: r[4], topic_id: r[5] || firstTopicId, ended_at: r[6] || '' };
    });
    if (topicId !== undefined && topicId !== null) {
      all = all.filter(function(c) { return c.topic_id == topicId; });
    }
    return all.sort(function(a, b) { return a.sort_order - b.sort_order; });
  },

  addCategory: function(name, isRoutine, topicId) {
    const cats = this.getCategories();
    const maxOrder = cats.length ? Math.max.apply(null, cats.map(function(c) { return c.sort_order; })) : -1;
    const id = this._nextId('category');
    this._appendRows(SHEETS.categories, [[id, name, isRoutine ? 1 : 0, maxOrder + 1, new Date().toISOString(), topicId, '']]);
    this.save();
    return id;
  },

  updateCategory: function(id, name, isRoutine, topicId) {
    const cats = this.getCategories();
    const idx = cats.findIndex(function(c) { return c.id === id; });
    if (idx < 0) return false;
    cats[idx].name = name;
    if (isRoutine !== undefined) cats[idx].is_routine = isRoutine ? 1 : 0;
    if (topicId !== undefined) cats[idx].topic_id = topicId;
    this._replaceSheet(SHEETS.categories, cats.map(function(c) {
      return [c.id, c.name, c.is_routine, c.sort_order, c.created_at, c.topic_id, c.ended_at || ''];
    }));
    this.save();
    return true;
  },

  moveCategory: function(id, direction) {
    const cats = this.getCategories();
    const idx = cats.findIndex(function(c) { return c.id === id; });
    if (idx < 0) return false;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= cats.length) return false;
    const tmp = cats[idx].sort_order;
    cats[idx].sort_order = cats[targetIdx].sort_order;
    cats[targetIdx].sort_order = tmp;
    this._replaceSheet(SHEETS.categories, cats.map(function(c) {
      return [c.id, c.name, c.is_routine, c.sort_order, c.created_at, c.topic_id, c.ended_at || ''];
    }));
    this.save();
    return true;
  },

  endCategory: function(id) {
    const cats = this.getCategories();
    const idx = cats.findIndex(function(c) { return c.id === id; });
    if (idx < 0) return false;
    cats[idx].ended_at = new Date().toISOString();
    this._replaceSheet(SHEETS.categories, cats.map(function(c) {
      return [c.id, c.name, c.is_routine, c.sort_order, c.created_at, c.topic_id, c.ended_at || ''];
    }));
    this.save();
    return true;
  },

  reopenCategory: function(id) {
    const cats = this.getCategories();
    const idx = cats.findIndex(function(c) { return c.id === id; });
    if (idx < 0) return false;
    cats[idx].ended_at = '';
    this._replaceSheet(SHEETS.categories, cats.map(function(c) {
      return [c.id, c.name, c.is_routine, c.sort_order, c.created_at, c.topic_id, c.ended_at || ''];
    }));
    this.save();
    return true;
  },

  deleteCategory: function(id) {
    const taskIds = this._sheetToJson(SHEETS.tasks)
      .filter(function(r) { return r[1] == id; })
      .map(function(r) { return r[0]; });

    const routines = this._sheetToJson(SHEETS.routine_records).filter(function(r) { return !taskIds.includes(r[1]); });
    this._replaceSheet(SHEETS.routine_records, routines);

    const stages = this._sheetToJson(SHEETS.stages).filter(function(r) { return !taskIds.includes(r[1]); });
    this._replaceSheet(SHEETS.stages, stages);

    const carries = this._sheetToJson(SHEETS.carry_overs).filter(function(r) { return !taskIds.includes(r[0]); });
    this._replaceSheet(SHEETS.carry_overs, carries);

    const tasks = this._sheetToJson(SHEETS.tasks).filter(function(r) { return r[1] != id; });
    this._replaceSheet(SHEETS.tasks, tasks);

    const cats = this.getCategories().filter(function(c) { return c.id !== id; });
    this._replaceSheet(SHEETS.categories, cats.map(function(c) {
      return [c.id, c.name, c.is_routine, c.sort_order, c.created_at, c.topic_id, c.ended_at || ''];
    }));
    this.save();
  }
};
