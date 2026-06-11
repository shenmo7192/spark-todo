// ExcelDB – thin entry; all logic lives in src/db/

const core = require('./src/db/core');
const topics = require('./src/db/topics');
const categories = require('./src/db/categories');
const tasks = require('./src/db/tasks');
const stages = require('./src/db/stages');
const routine = require('./src/db/routine');
const exportData = require('./src/db/export-data');

const { SHEETS, HEADERS } = core;

class ExcelDB {
  constructor(filePath) {
    this.filePath = filePath;
    this.workbook = null;
    this.init();
  }
}

// Mix in all module methods
Object.assign(ExcelDB.prototype, core);
Object.assign(ExcelDB.prototype, topics);
Object.assign(ExcelDB.prototype, categories);
Object.assign(ExcelDB.prototype, tasks);
Object.assign(ExcelDB.prototype, stages);
Object.assign(ExcelDB.prototype, routine);
Object.assign(ExcelDB.prototype, exportData);

module.exports = ExcelDB;
