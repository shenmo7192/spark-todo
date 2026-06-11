// Exporter – thin entry; all logic lives in src/export/

const styling = require('./src/export/styling');
const ledger = require('./src/export/ledger');
const kanban = require('./src/export/kanban');
const dbIo = require('./src/export/db-io');

class Exporter {
  constructor(db) {
    this.db = db;
  }
}

// Mix in all methods
Object.assign(Exporter.prototype, styling);
Object.assign(Exporter.prototype, ledger);
Object.assign(Exporter.prototype, kanban);
Object.assign(Exporter.prototype, dbIo);

// Static methods
Exporter._readImportFile = dbIo._readImportFile;
Exporter.parseImportVersion = dbIo.parseImportVersion;

module.exports = Exporter;
