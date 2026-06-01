const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const ExcelDB = require('./db');
const Exporter = require('./export');

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

let mainWindow;
let tray = null;
let db;
let exporter;
const isPackaged = app.isPackaged;

function initDataDir() {
  const dataDir = isPackaged
    ? path.join(app.getPath('userData'), 'data')
    : path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, 'todo.xlsx');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(trayIcon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Spark Todo');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  const dbFile = initDataDir();
  db = new ExcelDB(dbFile);
  exporter = new Exporter(db);
  createWindow();
  createTray();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers with error catching
function safeHandler(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      console.error('IPC Error:', e);
      throw e;
    }
  };
}

ipcMain.handle('db:getCategories', safeHandler(() => db.getCategories()));
ipcMain.handle('db:addCategory', safeHandler((_, name, isRoutine) => db.addCategory(name, isRoutine)));
ipcMain.handle('db:updateCategory', safeHandler((_, id, name, isRoutine) => db.updateCategory(id, name, isRoutine)));
ipcMain.handle('db:moveCategory', safeHandler((_, id, direction) => db.moveCategory(id, direction)));
ipcMain.handle('db:deleteCategory', safeHandler((_, id) => db.deleteCategory(id)));

ipcMain.handle('db:getTasks', safeHandler((_, categoryId, yearMonth) => db.getTasks(categoryId, yearMonth)));
ipcMain.handle('db:getTaskById', safeHandler((_, taskId) => db.getTaskById(taskId)));
ipcMain.handle('db:addTask', safeHandler((_, task) => db.addTask(task)));
ipcMain.handle('db:updateTask', safeHandler((_, task) => db.updateTask(task)));
ipcMain.handle('db:deleteTask', safeHandler((_, id) => db.deleteTask(id)));

ipcMain.handle('db:getStages', safeHandler((_, taskId) => db.getStages(taskId)));
ipcMain.handle('db:addStage', safeHandler((_, stage) => db.addStage(stage)));
ipcMain.handle('db:updateStage', safeHandler((_, stage) => db.updateStage(stage)));
ipcMain.handle('db:deleteStage', safeHandler((_, stageId) => db.deleteStage(stageId)));

ipcMain.handle('db:getRoutineRecord', safeHandler((_, taskId, yearMonth) => db.getRoutineRecord(taskId, yearMonth)));
ipcMain.handle('db:fillRoutine', safeHandler((_, record) => db.fillRoutine(record)));
ipcMain.handle('db:getLastMonthRoutine', safeHandler((_, taskId, yearMonth) => db.getLastMonthRoutine(taskId, yearMonth)));
ipcMain.handle('db:checkRoutineUnfilled', safeHandler((_, categoryId, yearMonth) => db.checkRoutineUnfilled(categoryId, yearMonth)));

ipcMain.handle('db:getAllActiveMonths', safeHandler(() => db.getAllActiveMonths()));
ipcMain.handle('db:carryOverTasks', safeHandler((_, targetYearMonth, categoryId) => db.carryOverTasks(targetYearMonth, categoryId)));
ipcMain.handle('db:getAllTasksByYear', safeHandler((_, year) => db.getAllTasksByYear(year)));
ipcMain.handle('db:batchReorderTasks', safeHandler((_, categoryId, taskIds) => db.batchReorderTasks(categoryId, taskIds)));
ipcMain.handle('db:changeTaskCategory', safeHandler((_, taskId, newCategoryId) => db.changeTaskCategory(taskId, newCategoryId)));
ipcMain.handle('db:bulkChangeTaskCategory', safeHandler((_, taskIds, newCategoryId) => db.bulkChangeTaskCategory(taskIds, newCategoryId)));

ipcMain.handle('export:excel', async (_, targetPath) => {
  try {
    await exporter.exportToExcel(targetPath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('export:excelDB', safeHandler(async (_, targetPath) => {
  try {
    await exporter.exportExcelDB(targetPath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}));

ipcMain.handle('import:excelDB', safeHandler(async (_, filePath) => {
  try {
    const data = Exporter._readImportFile(filePath);
    const { version, schemaVersion } = Exporter.parseImportVersion(data);
    return { data, version, schemaVersion };
  } catch (err) {
    throw new Error('文件读取失败: ' + err.message);
  }
}));

ipcMain.handle('import:data', safeHandler(async (_, data, mode) => {
  try {
    return exporter.importExcelDBRaw(data, mode);
  } catch (err) {
    throw new Error('导入失败: ' + err.message);
  }
}));

ipcMain.handle('dialog:showSaveDialog', async (_, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});

ipcMain.handle('dialog:showOpenDialog', async (_, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result;
});

ipcMain.handle('export:monthlyExcel', async (_, dirPath, startMonth, endMonth) => {
  try {
    await exporter.exportMonthly(dirPath, startMonth, endMonth);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('app:getVersion', () => {
  const pkg = require(path.join(__dirname, 'package.json'));
  return pkg.version;
});

ipcMain.handle('app:getDbSchemaVersion', () => {
  return '1';
});
