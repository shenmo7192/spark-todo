// Topic CRUD operations

const { SHEETS, HEADERS } = require('./core');

module.exports = {
  getTopics: function() {
    return this._sheetToJson(SHEETS.topics).map(function(r) {
      return { id: r[0], name: r[1], sort_order: r[2] || 0, created_at: r[3] };
    }).sort(function(a, b) { return a.sort_order - b.sort_order; });
  },

  addTopic: function(name) {
    const topics = this.getTopics();
    const maxOrder = topics.length ? Math.max.apply(null, topics.map(function(t) { return t.sort_order; })) : -1;
    const id = this._nextId('topic');
    this._appendRows(SHEETS.topics, [[id, name, maxOrder + 1, new Date().toISOString()]]);
    this.save();
    return id;
  },

  updateTopic: function(id, name) {
    const topics = this.getTopics();
    const idx = topics.findIndex(function(t) { return t.id === id; });
    if (idx < 0) return false;
    topics[idx].name = name;
    this._replaceSheet(SHEETS.topics, topics.map(function(t) {
      return [t.id, t.name, t.sort_order, t.created_at];
    }));
    this.save();
    return true;
  },

  deleteTopic: function(id) {
    const topics = this.getTopics();
    if (topics.length <= 1) throw new Error('至少保留一个专题');
    const remaining = topics.filter(function(t) { return t.id !== id; });
    const firstRemainingId = remaining[0].id;
    const cats = this.getCategories();
    const updatedCats = cats.map(function(c) {
      if (c.topic_id === id) c.topic_id = firstRemainingId;
      return c;
    });
    this._replaceSheet(SHEETS.categories, updatedCats.map(function(c) {
      return [c.id, c.name, c.is_routine, c.sort_order, c.created_at, c.topic_id];
    }));
    this._replaceSheet(SHEETS.topics, remaining.map(function(t) {
      return [t.id, t.name, t.sort_order, t.created_at];
    }));
    this.save();
  }
};
