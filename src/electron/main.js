import { ClipboardDebouncer } from './clipboard_debouncer.js';
import { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, clipboard, globalShortcut, screen } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { execFile } from 'child_process';
import crypto from 'crypto';
import { IPC_CHANNELS } from '../constants/ipcChannels.js';

const MAX_LOG_SIZE_BYTES = 1024 * 1024; // 1 MB cap (LOW-03)
let logCounter = 0;

function getLogPath() {
  try { return path.join(app.getPath('userData'), 'app-debug.log'); }
  catch {
    try { return path.join(app.getPath('temp'), 'clipboardpro-debug.log'); }
    catch { return path.join(app.getAppPath(), 'app-debug.log'); }
  }
}

function rotateLogIfNeeded(logPath) {
  try {
    if (fs.existsSync(logPath)) {
      const stats = fs.statSync(logPath);
      if (stats.size > MAX_LOG_SIZE_BYTES) {
        const oldLogPath = logPath + '.old';
        try { if (fs.existsSync(oldLogPath)) fs.unlinkSync(oldLogPath); } catch {}
        fs.renameSync(logPath, oldLogPath);
      }
    }
  } catch {}
}

function log(msg) {
  try {
    const logPath = getLogPath();
    if (++logCounter % 100 === 1) {
      rotateLogIfNeeded(logPath);
    }
    fs.appendFileSync(logPath, `${new Date().toISOString()} ${msg}\r\n`);
  } catch {}
}

// --- Single Instance Lock ---
const gotTheLock = app.requestSingleInstanceLock();
log(`SINGLE_INSTANCE_LOCK: ${gotTheLock}, argv: ${process.argv.join(' ')}`);
if (!gotTheLock) {
  log('QUITTING: another instance holds the lock');
  app.quit();
  process.exit(0);
}

// Cap Chromium compositor frame rate to 120 FPS to prevent GPU saturation on high-refresh displays
app.commandLine.appendSwitch('limit-fps', '120');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const iconPath = path.join(app.getAppPath(), 'dist-react', 'images', 'ClipBoardPro_Logo.ico');

// Media storage management (ADR-0002)
const mediaDir = path.join(app.getPath('userData'), 'media');
try {
  if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true });
  }
} catch (e) {
  log(`Failed to create media directory: ${e}`);
}

function saveImageToDisk(nativeImg) {
  try {
    if (!fs.existsSync(mediaDir)) {
      fs.mkdirSync(mediaDir, { recursive: true });
    }
    const imageId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const filePath = path.join(mediaDir, `${imageId}.png`);
    fs.writeFileSync(filePath, nativeImg.toPNG());
    return filePath;
  } catch (err) {
    log(`Failed to save image to disk: ${err}`);
    return nativeImg.toDataURL();
  }
}


// --- Working Set Trimming on Idle (ADR-0001 / DEC-001) ---
let memoryTrimTimer = null;

function getTrimMemoryExecutablePath() {
  const candidates = [
    path.join(process.resourcesPath, 'trim_memory.exe'),
    path.join(app.getAppPath(), 'resources', 'trim_memory.exe'),
    path.join(app.getAppPath(), '..', 'resources', 'trim_memory.exe'),
    path.join(path.dirname(app.getPath('exe')), 'resources', 'trim_memory.exe')
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function trimMemory() {
  try {
    const exePath = getTrimMemoryExecutablePath();
    if (!exePath) {
      log('trimMemory: trim_memory.exe not found');
      return;
    }
    execFile(exePath, [], { windowsHide: true }, (error) => {
      if (error) {
        log(`trimMemory error: ${error.message}`);
      } else {
        log('trimMemory: EmptyWorkingSet executed successfully');
      }
    });
  } catch (err) {
    log(`trimMemory exception: ${err.message}`);
  }
}

function scheduleMemoryTrim(delayMs = 2000) {
  cancelMemoryTrim();
  memoryTrimTimer = setTimeout(() => {
    memoryTrimTimer = null;
    log('scheduleMemoryTrim: 2000ms idle elapsed, trimming working set');
    trimMemory();
  }, delayMs);
}

function cancelMemoryTrim() {
  if (memoryTrimTimer) {
    clearTimeout(memoryTrimTimer);
    memoryTrimTimer = null;
    log('cancelMemoryTrim: cancelled memory trim timer');
  }
}

let mainWindow;
let tray = null;
let isQuitting = false;
let closeBehavior = 'minimize';
let startMinimized = false;
let openAtLogin = true;
let hotkeys = {
  quickAccess: 'Ctrl+Shift+X',
  clearAll: 'Ctrl+Shift+Delete'
};

function getConfigFilePath() {
  try {
    return path.join(app.getPath('userData'), 'app-config.json');
  } catch {
    try {
      return path.join(app.getPath('temp'), 'clipboardpro-config.json');
    } catch {
      return path.join(app.getAppPath(), 'app-config.json');
    }
  }
}

function loadConfig() {
  try {
    const cp = getConfigFilePath();
    if (fs.existsSync(cp)) {
      const data = JSON.parse(fs.readFileSync(cp, 'utf8'));
      if (typeof data.startMinimized === 'boolean') startMinimized = data.startMinimized;
      if (typeof data.closeBehavior === 'string') closeBehavior = data.closeBehavior;
      if (typeof data.openAtLogin === 'boolean') openAtLogin = data.openAtLogin;
      if (data.hotkeys) hotkeys = { ...hotkeys, ...data.hotkeys };
    }
  } catch (error) {
    console.error('Failed to load config:', error);
  }
}

function saveConfig() {
  try {
    const cp = getConfigFilePath();
    const data = {
      startMinimized,
      closeBehavior,
      openAtLogin,
      hotkeys
    };
    fs.writeFileSync(cp, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to save config:', error);
  }
}

// เพิ่มตัวแปรสำหรับ clipboard monitoring (ADR-0003)
let clipboardMonitorInterval = null;
let lastClipboardText = '';
let lastClipboardImageHash = '';
let lastImageSize = null;
let isMonitoringActive = false;
let isInternalCopy = false;

function getClipboardImageHash(nativeImg) {
  if (!nativeImg || nativeImg.isEmpty()) return '';
  try {
    const bitmap = nativeImg.toBitmap();
    return crypto.createHash('md5').update(bitmap).digest('hex');
  } catch {
    return '';
  }
}

function processClipboardImage(image) {
  if (!image || image.isEmpty()) return false;
  try {
    const imageHash = getClipboardImageHash(image);
    if (!imageHash || imageHash === lastClipboardImageHash) {
      return false;
    }

    const imgSize = image.getSize();
    lastClipboardImageHash = imageHash;
    lastImageSize = imgSize;

    const filePath = saveImageToDisk(image);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.CLIPBOARD_CHANGED, {
        type: 'image',
        content: filePath,
        timestamp: new Date().toISOString()
      });
    }
    return true;
  } catch (err) {
    log(`processClipboardImage error: ${err}`);
    return false;
  }
}

const clipboardDebouncer = new ClipboardDebouncer({
  delayMs: 50,
  onClipboardChange: () => checkClipboardContent()
});

function checkClipboardContent() {
  if (!isMonitoringActive || isInternalCopy) return;

  try {
    // 1. ตรวจสอบ text
    const currentText = clipboard.readText();
    if (currentText && 
        currentText !== lastClipboardText && 
        currentText.trim() !== '' &&
        currentText.length > 0 &&
        currentText.length < 1000000) {
      
      lastClipboardText = currentText;
      
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.CLIPBOARD_CHANGED, {
          type: 'text',
          content: currentText,
          timestamp: new Date().toISOString()
        });
      }
    }

    // 2. ตรวจสอบ image
    const formats = clipboard.availableFormats();
    const hasImageFormat = formats.some(f => f.includes('image') || f === 'CF_DIB' || f === 'CF_BITMAP');
    if (hasImageFormat) {
      const currentImage = clipboard.readImage();
      processClipboardImage(currentImage);
    }
  } catch (err) {
    log(`checkClipboardContent error: ${err.message}`);
  }
}
let internalCopyTimeout = null;

function markInternalCopy() {
  isInternalCopy = true;
  if (internalCopyTimeout) clearTimeout(internalCopyTimeout);
  internalCopyTimeout = setTimeout(() => {
    isInternalCopy = false;
  }, 200);
}

function findIndexHtml() {
  const appPath = app.getAppPath();
  const possiblePaths = [
    path.join(appPath, 'dist-react', 'index.html'),
    path.join(__dirname, '../dist-react/index.html'),
    path.join(__dirname, '../../dist-react/index.html')
  ];

  for (const testPath of possiblePaths) {
    if (fs.existsSync(testPath)) {
      return testPath;
    }
  }

  return null;
}

function setAutoStart(enabled) {
  try {
    openAtLogin = enabled;
    saveConfig();
    
    const args = [];
    if (enabled) {
      args.push('--autostart');
      if (startMinimized) {
        args.push('--hidden');
      }
    }
    
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: enabled && startMinimized,
      name: 'ClipBoard Pro',
      path: process.execPath,
      args: args
    });
    
    return true;
  } catch {
    return false;
  }
}

function initializeAutoStart() {
  if (!app.isPackaged) {
    return;
  }
  try {
    const loginItemSettings = app.getLoginItemSettings();
    if (openAtLogin && !loginItemSettings.openAtLogin) {
      setAutoStart(true);
    } else if (!openAtLogin && loginItemSettings.openAtLogin) {
      setAutoStart(false);
    }
  } catch (error) {
    log(`initializeAutoStart error: ${error.message}`);
  }
}

function getAutoStartStatus() {
  try {
    const loginItemSettings = app.getLoginItemSettings();
    return {
      openAtLogin: loginItemSettings.openAtLogin,
      openAsHidden: loginItemSettings.openAsHidden,
      wasOpenedAtLogin: loginItemSettings.wasOpenedAtLogin,
      wasOpenedAsHidden: loginItemSettings.wasOpenedAsHidden
    };
  } catch {
    return { openAtLogin: false, openAsHidden: false };
  }
}

function handleCommandLineArgs() {
  loadConfig();
  const args = process.argv;
  
  if (args.includes('--hidden')) {
    startMinimized = true;
  } else if (args.includes('--autostart')) {
    // If started automatically, respect startMinimized from loaded config
  }
}

// Event-Driven Clipboard Monitoring with 50 ms Debounce (ADR-0003)
function startClipboardMonitoring() {
  if (isMonitoringActive) return;
  isMonitoringActive = true;

  try {
    lastClipboardText = clipboard.readText();
    const image = clipboard.readImage();
    lastClipboardImageHash = getClipboardImageHash(image);
    if (!image.isEmpty()) {
      lastImageSize = image.getSize();
    }
  } catch {
    // Silent error handling
  }

  // Active clipboard polling interval ensures reliable capture across all platforms
  if (!clipboardMonitorInterval) {
    clipboardMonitorInterval = setInterval(() => {
      if (isMonitoringActive && !isInternalCopy) {
        clipboardDebouncer.trigger();
      }
    }, 350);
  }
}

function stopClipboardMonitoring() {
  isMonitoringActive = false;
  clipboardDebouncer.cancel();
  if (clipboardMonitorInterval) {
    clearInterval(clipboardMonitorInterval);
    clipboardMonitorInterval = null;
  }
}

function registerGlobalShortcuts() {
  try {
    globalShortcut.unregisterAll();
    
    if (hotkeys.quickAccess) {
      const quickAccessKey = hotkeys.quickAccess.replace('Ctrl', process.platform === 'darwin' ? 'Cmd' : 'Ctrl');
      globalShortcut.register(quickAccessKey, () => {
        showWindowAtCursor();
      });
    }
    
    if (hotkeys.clearAll) {
      const clearAllKey = hotkeys.clearAll.replace('Ctrl', process.platform === 'darwin' ? 'Cmd' : 'Ctrl');
      globalShortcut.register(clearAllKey, () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IPC_CHANNELS.CLEAR_ALL_SHORTCUT);
        }
      });
    }

    if (process.platform === 'darwin') {
      globalShortcut.register('Cmd+Shift+4', () => {
        setTimeout(checkClipboardForScreenshot, 1000);
        setTimeout(checkClipboardForScreenshot, 3000);
      });
      
      globalShortcut.register('Cmd+Shift+3', () => {
        setTimeout(checkClipboardForScreenshot, 1000);
        setTimeout(checkClipboardForScreenshot, 3000);
      });
    }

    if (process.platform === 'win32') {
      globalShortcut.register('PrintScreen', () => {
        setTimeout(checkClipboardForScreenshot, 1000);
        setTimeout(checkClipboardForScreenshot, 2500);
      });
      
      globalShortcut.register('Alt+PrintScreen', () => {
        setTimeout(checkClipboardForScreenshot, 1000);
        setTimeout(checkClipboardForScreenshot, 2500);
      });
    }
  } catch (err) {
    log(`registerGlobalShortcuts error: ${err.message}`);
  }
}

function showWindowAtCursor() {
  if (!mainWindow) return;
  
  try {
        const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    
    const windowBounds = mainWindow.getBounds();
    const x = Math.max(display.bounds.x, Math.min(
      cursor.x - windowBounds.width / 2,
      display.bounds.x + display.bounds.width - windowBounds.width
    ));
    const y = Math.max(display.bounds.y, Math.min(
      cursor.y - windowBounds.height / 2,
      display.bounds.y + display.bounds.height - windowBounds.height
    ));
    
    mainWindow.setPosition(Math.round(x), Math.round(y));
    
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
  } catch {
    showWindow();
  }
}

async function checkClipboardForScreenshot() {
  if (!isMonitoringActive) return;
  if (isInternalCopy) return;
  
  try {
    const formats = clipboard.availableFormats();
    const hasImageFormat = formats.some(f => f.includes('image') || f === 'CF_DIB' || f === 'CF_BITMAP');
    if (!hasImageFormat) return;

    const image = clipboard.readImage();
    processClipboardImage(image);
  } catch {
    // Silent error handling
  }
}

function createTray() {
  if (tray) {
    try { tray.destroy(); } catch {}
    tray = null;
  }
  
  const trayIconPath = path.join(app.getAppPath(), 'dist-react', 'images', 'ClipBoardPro_Logo.png');
  const icon = nativeImage.createFromPath(trayIconPath).resize({ width: 16, height: 16 });
  
  try {
    tray = new Tray(icon);
    tray.setToolTip('ClipBoard Pro - Clipboard Manager');
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'ClipBoard Pro',
        type: 'normal',
        enabled: false
      },
      {
        type: 'separator'
      },
      {
        label: 'Show Window',
        type: 'normal',
        click: showWindow
      },
      {
        label: 'Hide Window',
        type: 'normal',
        click: hideWindow
      },
      {
        type: 'separator'
      },
      {
        label: 'Quit',
        type: 'normal',
        click: quitApp
      }
    ]);
    
    tray.setContextMenu(contextMenu);
    
    tray.on('double-click', () => {
      if (mainWindow && mainWindow.isVisible()) {
        hideWindow();
      } else {
        showWindow();
      }
    });
    
    tray.on('click', () => {
      if (mainWindow && mainWindow.isVisible()) {
        hideWindow();
      } else {
        showWindow();
      }
    });
  } catch (err) {
    console.error('Failed to create tray:', err);
  }
}

function showWindow() {
  if (!tray) {
    createTray();
  }
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
  }
}

function hideWindow() {
  if (!tray) {
    createTray();
  }
  if (mainWindow) {
    mainWindow.hide();
  }
}

function quitApp() {
  isQuitting = true;
  cancelMemoryTrim();
  stopClipboardMonitoring();
  globalShortcut.unregisterAll();
  if (tray) {
    tray.destroy();
  }
  app.quit();
}

function createWindow() {
  handleCommandLineArgs();
  
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 640,
    minHeight: 480,
    icon: iconPath,
    frame: false,
    titleBarStyle: 'hidden',
    roundedCorners: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: true,
      offscreen: false
    },
    show: !startMinimized,
    backgroundColor: '#0a0a0a',
    transparent: false,
    hasShadow: true
  });

  // Electron Security: Intercept window.open / <a target="_blank">
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(url);
      }
    } catch {}
    return { action: 'deny' };
  });

  // Electron Security: Prevent navigation away from the app
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentURL = mainWindow.webContents.getURL();
    if (currentURL && url !== currentURL) {
      event.preventDefault();
      try {
        const parsed = new URL(url);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          shell.openExternal(url);
        }
      } catch {}
    }
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = findIndexHtml();
    if (indexPath) {
      mainWindow.loadFile(indexPath);
    } else {
      mainWindow.loadFile(path.join(app.getAppPath(), 'dist-react', 'index.html'));
    }
  }

  mainWindow.once('ready-to-show', () => {
    if (!startMinimized) {
      mainWindow.show();
    } else {
      scheduleMemoryTrim(3000);
    }
    
    setTimeout(() => {
      startClipboardMonitoring();
      registerGlobalShortcuts();
    }, 1000);
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      if (closeBehavior === 'minimize') {
        hideWindow();
      } else {
        quitApp();
      }
    }
  });

  mainWindow.on('hide', () => {
    scheduleMemoryTrim(2000);
  });

  mainWindow.on('show', () => {
    cancelMemoryTrim();
    if (!isMonitoringActive) {
      startClipboardMonitoring();
    }
  });

  if (process.platform === 'win32') {
    try {
      mainWindow.hookWindowMessage(0x031D, () => {
        if (isMonitoringActive && !isInternalCopy) {
          clipboardDebouncer.trigger();
        }
      });
    } catch (err) {
      log('Failed to hook WM_CLIPBOARDUPDATE: ' + err);
    }
  }

  mainWindow.on('maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.WINDOW_MAXIMIZED_EVENT, true);
    }
  });

  mainWindow.on('unmaximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.WINDOW_MAXIMIZED_EVENT, false);
    }
  });

  if (!tray) {
    createTray();
  }
}

function registerWindowIpcHandlers() {
  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (closeBehavior === 'minimize') {
        hideWindow();
      } else {
        quitApp();
      }
    }
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_IS_MAXIMIZED, () => {
    return mainWindow && !mainWindow.isDestroyed() ? mainWindow.isMaximized() : false;
  });

  ipcMain.handle(IPC_CHANNELS.TRIM_MEMORY, () => {
    trimMemory();
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.SHOW_WINDOW, () => {
    showWindow();
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.HIDE_WINDOW, () => {
    hideWindow();
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.QUIT_APP, () => {
    quitApp();
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.OPEN_EXTERNAL, async (_event, rawUrl) => {
    try {
      if (rawUrl && typeof rawUrl === 'string') {
        const parsed = new URL(rawUrl);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          await shell.openExternal(rawUrl);
          return true;
        }
      }
    } catch {
      log(`open-external rejected url: ${rawUrl}`);
    }
    return false;
  });
}

app.whenReady().then(() => {
  initializeAutoStart();
  registerWindowIpcHandlers();
  createWindow();

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      showWindow();
    }
  });

});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});

app.on('before-quit', () => {
  log(`app before-quit event (isQuitting: ${isQuitting})`);
  isQuitting = true;
  cancelMemoryTrim();
  stopClipboardMonitoring();
  globalShortcut.unregisterAll();
});

app.on('will-quit', () => {
  log('app will-quit event');
  stopClipboardMonitoring();
  globalShortcut.unregisterAll();
  if (tray) {
    tray.destroy();
  }
});

process.on('uncaughtException', (err) => {
  log(`UNCAUGHT_EXCEPTION: ${err ? err.stack || err : 'unknown'}`);
});

process.on('unhandledRejection', (err) => {
  log(`UNHANDLED_REJECTION: ${err ? err.stack || err : 'unknown'}`);
});

// IPC handlers สำหรับ clipboard (LOW-01, LOW-04, LOW-05)
ipcMain.handle(IPC_CHANNELS.START_MONITORING, () => {
  try {
    startClipboardMonitoring();
    return true;
  } catch (err) {
    log(`start-clipboard-monitoring error: ${err.message}`);
    return false;
  }
});

ipcMain.handle(IPC_CHANNELS.STOP_MONITORING, () => {
  try {
    stopClipboardMonitoring();
    return true;
  } catch (err) {
    log(`stop-clipboard-monitoring error: ${err.message}`);
    return false;
  }
});

ipcMain.handle(IPC_CHANNELS.GET_TEXT, () => {
  try {
    return clipboard.readText();
  } catch (err) {
    log(`get-clipboard-text error: ${err.message}`);
    return '';
  }
});

ipcMain.handle(IPC_CHANNELS.GET_IMAGE, () => {
  try {
    const image = clipboard.readImage();
    return image.isEmpty() ? null : image.toDataURL();
  } catch (err) {
    log(`get-clipboard-image error: ${err.message}`);
    return null;
  }
});

// ปรับปรุง IPC handlers สำหรับ set clipboard - ไม่ต้องใช้ internal flags แล้ว
ipcMain.handle(IPC_CHANNELS.SET_TEXT, (event, text) => {
  try {
    if (typeof text !== 'string') {
      log('set-clipboard-text rejected: argument must be a string');
      return false;
    }
    markInternalCopy();
    lastClipboardText = text;
    clipboard.writeText(text);
    return true;
  } catch (err) {
    log(`set-clipboard-text error: ${err.message}`);
    return false;
  }
});

ipcMain.handle(IPC_CHANNELS.SET_IMAGE, (event, imageSource) => {
  try {
    if (!imageSource || typeof imageSource !== 'string') {
      log('set-clipboard-image rejected: invalid imageSource argument');
      return false;
    }
    markInternalCopy();
    let image;
    if (imageSource.startsWith('data:image/') || imageSource.includes('base64')) {
      image = nativeImage.createFromDataURL(imageSource);
    } else if (fs.existsSync(imageSource)) {
      image = nativeImage.createFromPath(imageSource);
    } else {
      image = nativeImage.createFromDataURL(imageSource);
    }
    if (!image || image.isEmpty()) {
      log('set-clipboard-image rejected: failed to create valid nativeImage');
      return false;
    }
    lastImageSize = image.getSize();
    lastClipboardImageHash = getClipboardImageHash(image);
    clipboard.writeImage(image);
    return true;
  } catch (err) {
    log(`set-clipboard-image error: ${err.message}`);
    return false;
  }
});

// IPC handlers for media storage lifecycle (ADR-0002)
ipcMain.handle(IPC_CHANNELS.MEDIA_DELETE, async (event, filePath) => {
  try {
    if (filePath && typeof filePath === 'string') {
      const resolvedTarget = path.resolve(filePath);
      const resolvedMediaDir = path.resolve(mediaDir);
      const isWindows = process.platform === 'win32';
      const targetCheck = isWindows ? resolvedTarget.toLowerCase() : resolvedTarget;
      const dirCheck = isWindows ? resolvedMediaDir.toLowerCase() : resolvedMediaDir;
      if (targetCheck.startsWith(dirCheck + path.sep) && fs.existsSync(resolvedTarget)) {
        await fs.promises.unlink(resolvedTarget);
        return true;
      }
    }
  } catch (e) {
    log(`media:delete error: ${e.message}`);
  }
  return false;
});

ipcMain.handle(IPC_CHANNELS.MEDIA_CLEAR_ALL, async () => {
  try {
    lastClipboardImageHash = '';
    if (fs.existsSync(mediaDir)) {
      const files = await fs.promises.readdir(mediaDir);
      for (const f of files) {
        if (f.endsWith('.png')) {
          await fs.promises.unlink(path.join(mediaDir, f)).catch(err => {
            log(`media:clear-all unlink error: ${err.message}`);
          });
        }
      }
    }
    return true;
  } catch (err) {
    log(`media:clear-all error: ${err.message}`);
    return false;
  }
});

ipcMain.handle(IPC_CHANNELS.MEDIA_RECONCILE, async (event, activeFilePaths) => {
  try {
    if (fs.existsSync(mediaDir) && Array.isArray(activeFilePaths)) {
      const activeSet = new Set(activeFilePaths.map(p => path.normalize(p).toLowerCase()));
      const files = await fs.promises.readdir(mediaDir);
      for (const f of files) {
        if (f.endsWith('.png')) {
          const full = path.normalize(path.join(mediaDir, f)).toLowerCase();
          if (!activeSet.has(full)) {
            await fs.promises.unlink(path.join(mediaDir, f)).catch(err => {
              log(`media:reconcile unlink error: ${err.message}`);
            });
          }
        }
      }
    }
    return true;
  } catch (err) {
    log(`media:reconcile error: ${err.message}`);
    return false;
  }
});

// IPC handler สำหรับ close behavior setting
ipcMain.handle(IPC_CHANNELS.SET_CLOSE_BEHAVIOR, (event, behavior) => {
  if (behavior !== 'minimize' && behavior !== 'close') {
    log(`set-close-behavior rejected: invalid behavior "${behavior}"`);
    return false;
  }
  closeBehavior = behavior;
  saveConfig();
  return true;
});

ipcMain.handle(IPC_CHANNELS.GET_CLOSE_BEHAVIOR, () => {
  return closeBehavior;
});

// IPC handlers สำหรับ start minimized setting
ipcMain.handle(IPC_CHANNELS.SET_START_MINIMIZED, (event, minimized) => {
  startMinimized = Boolean(minimized);
  saveConfig();
  
  if (openAtLogin) {
    setAutoStart(true);
  }
  
  return true;
});

ipcMain.handle(IPC_CHANNELS.GET_START_MINIMIZED, () => {
  return startMinimized;
});

// IPC handlers สำหรับ Auto Start
ipcMain.handle(IPC_CHANNELS.SET_AUTO_START, (event, enabled) => {
  return setAutoStart(Boolean(enabled));
});

ipcMain.handle(IPC_CHANNELS.GET_AUTO_START, () => {
  const status = getAutoStartStatus();
  return status.openAtLogin;
});

ipcMain.handle(IPC_CHANNELS.GET_AUTO_START_STATUS, () => {
  return getAutoStartStatus();
});

// IPC handlers สำหรับ hotkeys
ipcMain.handle(IPC_CHANNELS.UPDATE_HOTKEYS, (event, newHotkeys) => {
  try {
    if (!newHotkeys || typeof newHotkeys !== 'object') {
      log('update-hotkeys rejected: argument must be an object');
      return false;
    }
    const sanitized = {};
    if (typeof newHotkeys.quickAccess === 'string') sanitized.quickAccess = newHotkeys.quickAccess;
    if (typeof newHotkeys.clearAll === 'string') sanitized.clearAll = newHotkeys.clearAll;
    hotkeys = { ...hotkeys, ...sanitized };
    registerGlobalShortcuts();
    return true;
  } catch (err) {
    log(`update-hotkeys error: ${err.message}`);
    return false;
  }
});

ipcMain.handle(IPC_CHANNELS.GET_HOTKEYS, () => {
  return hotkeys;
});