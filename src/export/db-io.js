// DB backup/restore – 数据库导入导出

const xlsx = require('xlsx-js-style');
const path = require('path');
const fs = require('fs');

function _readImportFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  const wb = xlsx.read(buffer, { type: 'buffer' });
  const result = {};
  const metaSheet = wb.Sheets['meta'];
  if (metaSheet) result.meta = xlsx.utils.sheet_to_json(metaSheet);
  else result.meta = [];
  const sheetNames = ['topics', 'categories', 'tasks', 'stages', 'routine_records', 'carry_overs'];
  for (const name of sheetNames) {
    const sheet = wb.Sheets[name];
    result[name] = sheet ? xlsx.utils.sheet_to_json(sheet) : [];
  }
  return result;
}

function parseImportVersion(data) {
  let version = '1.0.0';
  let schemaVersion = '1';
  if (data.meta) {
    for (const row of data.meta) {
      if (row.key === 'app_version') version = row.value || '1.0.0';
      if (row.key === 'db_schema_version') schemaVersion = String(row.value || '1');
    }
  }
  return { version, schemaVersion };
}

function exportExcelDB(targetPath) {
  const APP_VERSION = '1.1.0';
  const DB_SCHEMA_VERSION = '1';

  const allCategories = this.db._sheetToJson('categories');
  const allTopics = this.db._sheetToJson('topics');
  const allTasks = this.db._sheetToJson('tasks');
  const allStages = this.db._sheetToJson('stages');
  const allRoutines = this.db._sheetToJson('routine_records');
  const allCarries = this.db._sheetToJson('carry_overs');
  const allMeta = this.db._sheetToJson('meta');

  const metaWithVersion = [...allMeta];
  const versionKeys = ['app_version', 'db_schema_version', 'exported_at', 'app_name'];
  const filteredMeta = metaWithVersion.filter(r => !versionKeys.includes(r[0]));
  filteredMeta.push(['app_version', APP_VERSION]);
  filteredMeta.push(['db_schema_version', DB_SCHEMA_VERSION]);
  filteredMeta.push(['exported_at', new Date().toISOString()]);
  filteredMeta.push(['app_name', 'Spark Todo']);

  const wb = xlsx.utils.book_new();
  const wsMeta = xlsx.utils.aoa_to_sheet([['key', 'value'], ...filteredMeta]);
  xlsx.utils.book_append_sheet(wb, wsMeta, 'meta');

  const arraySheets = [
    { name: 'topics', headers: ['id', 'name', 'sort_order', 'created_at'], data: allTopics },
    { name: 'categories', headers: ['id', 'name', 'is_routine', 'sort_order', 'created_at', 'topic_id', 'ended_at'], data: allCategories },
    { name: 'tasks', headers: ['id', 'category_id', 'title', 'description', 'status', 'progress', 'is_routine', 'created_at', 'started_at', 'completed_at', 'sort_order', 'importance', 'manual_duration', 'contact_person'], data: allTasks },
    { name: 'stages', headers: ['id', 'task_id', 'stage_index', 'note', 'progress_value', 'created_at', 'updated_at', 'is_completed'], data: allStages },
    { name: 'routine_records', headers: ['id', 'task_id', 'year_month', 'quantity', 'filled_at'], data: allRoutines }
  ];

  for (const sheet of arraySheets) {
    const ws = xlsx.utils.aoa_to_sheet(sheet.data.length > 0 ? [sheet.headers, ...sheet.data] : [sheet.headers]);
    xlsx.utils.book_append_sheet(wb, ws, sheet.name);
  }

  const carryHeaders = ['task_id', 'year_month', 'carried_at'];
  const wsCarry = xlsx.utils.aoa_to_sheet(allCarries.length > 0 ? [carryHeaders, ...allCarries] : [carryHeaders]);
  xlsx.utils.book_append_sheet(wb, wsCarry, 'carry_overs');

  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  xlsx.writeFile(wb, targetPath);
  return targetPath;
}

function importExcelDB(filePath, mode) {
  const data = _readImportFile(filePath);
  return this.importExcelDBRaw(data, mode);
}

const SHEET_HEADERS = {
  categories: ['id', 'name', 'is_routine', 'sort_order', 'created_at', 'topic_id', 'ended_at'],
  tasks: ['id', 'category_id', 'title', 'description', 'status', 'progress', 'is_routine', 'created_at', 'started_at', 'completed_at', 'sort_order', 'importance', 'manual_duration', 'contact_person'],
  stages: ['id', 'task_id', 'stage_index', 'note', 'progress_value', 'created_at', 'updated_at', 'is_completed'],
  routine_records: ['id', 'task_id', 'year_month', 'quantity', 'filled_at'],
  carry_overs: ['task_id', 'year_month', 'carried_at']
};

function importExcelDBRaw(data, mode) {
  const { version, schemaVersion } = parseImportVersion(data);
  if (schemaVersion !== '1') {
    return { success: false, error: '数据架构版本不兼容：文件为 v' + schemaVersion + '，当前支持 v1' };
  }

  if (mode === 'replace') {
    if (data['topics'] && data['topics'].length > 0) {
      const topicHeaders = ['id', 'name', 'sort_order', 'created_at'];
      const rows = data['topics'].map(function(row) {
        return topicHeaders.map(function(h) { return row[h] !== undefined ? row[h] : ''; });
      });
      this.db._replaceSheet('topics', rows);
    } else {
      this.db._replaceSheet('topics', []);
    }

    var sheetNames = ['categories', 'tasks', 'stages', 'routine_records', 'carry_overs'];
    for (var si = 0; si < sheetNames.length; si++) {
      var name = sheetNames[si];
      var sheetName = name;
      var headers = SHEET_HEADERS[name];

      if (data[name] && data[name].length > 0) {
        var rows = data[name].map(function(row) {
          return headers.map(function(h) { return row[h] !== undefined ? row[h] : ''; });
        });
        this.db._replaceSheet(sheetName, rows);
      } else {
        this.db._replaceSheet(sheetName, []);
      }
    }

    var versionKeys = ['app_version', 'db_schema_version', 'exported_at', 'app_name'];
    var cleanMeta = (data.meta || []).filter(function(r) { return !versionKeys.includes(r.key); });
    this.db._replaceSheet('meta', cleanMeta.map(function(r) { return [r.key, r.value]; }));
  } else if (mode === 'merge') {
    if (data['topics'] && data['topics'].length > 0) {
      var existing = this.db._sheetToJson('topics');
      var existingIds = new Set(existing.map(function(r) { return r[0]; }));
      for (var ti = 0; ti < data['topics'].length; ti++) {
        var item = data['topics'][ti];
        if (!existingIds.has(item.id)) {
          this.db._appendRows('topics', [[item.id, item.name, item.sort_order, item.created_at]]);
        }
      }
    }

    var mergeNames = ['categories', 'tasks', 'stages', 'routine_records'];
    for (var mi = 0; mi < mergeNames.length; mi++) {
      var mname = mergeNames[mi];
      if (data[mname] && data[mname].length > 0) {
        var mexisting = this.db._sheetToJson(mname);
        var mIds = new Set(mexisting.map(function(r) { return r[0]; }));
        var newRows = [];
        for (var mj = 0; mj < data[mname].length; mj++) {
          var mitem = data[mname][mj];
          if (!mIds.has(mitem.id)) {
            var mheaders = SHEET_HEADERS[mname];
            newRows.push(mheaders.map(function(h) { return mitem[h] !== undefined ? mitem[h] : ''; }));
          }
        }
        if (newRows.length > 0) {
          for (var nr = 0; nr < newRows.length; nr++) this.db._appendRows(mname, [newRows[nr]]);
        }
      }
    }

    if (data['carry_overs'] && data['carry_overs'].length > 0) {
      var coexisting = this.db._sheetToJson('carry_overs');
      var coSet = new Set(coexisting.map(function(r) { return r[0] + '|' + r[1]; }));
      for (var ci = 0; ci < data['carry_overs'].length; ci++) {
        var citem = data['carry_overs'][ci];
        var cokey = citem.task_id + '|' + citem.year_month;
        if (!coSet.has(cokey)) {
          this.db._appendRows('carry_overs', [[citem.task_id, citem.year_month, citem.carried_at]]);
        }
      }
    }

    var mvk = ['app_version', 'db_schema_version', 'exported_at', 'app_name'];
    var mcleanMeta = (data.meta || []).filter(function(r) { return !mvk.includes(r.key); });
    var mexistingMeta = this.db._sheetToJson('meta');
    var metaMap = {};
    for (var me = 0; me < mexistingMeta.length; me++) {
      metaMap[mexistingMeta[me][0]] = parseInt(mexistingMeta[me][1]) || 0;
    }
    for (var mc = 0; mc < mcleanMeta.length; mc++) {
      var mkey = mcleanMeta[mc].key;
      if (mkey && mkey.startsWith('last_') && metaMap[mkey] !== undefined) {
        metaMap[mkey] = Math.max(metaMap[mkey], parseInt(mcleanMeta[mc].value) || 0);
      } else if (!metaMap[mkey]) {
        metaMap[mkey] = mcleanMeta[mc].value;
      }
    }
    var mergedMeta = Object.keys(metaMap).map(function(k) { return [k, metaMap[k]]; });
    this.db._replaceSheet('meta', mergedMeta);
  }

  this.db.save();
  return { success: true, version: version, schemaVersion: schemaVersion };
}

module.exports = {
  _readImportFile,
  parseImportVersion,
  exportExcelDB,
  importExcelDB,
  importExcelDBRaw
};
