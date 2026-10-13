import { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, clipboard, globalShortcut, screen } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { execFile } from 'child_process';

function getLogPath() {
  try { return path.join(app.getPath('userData'), 'app-debug.log'); }
  catch (e) { return path.join(process.cwd(), 'app-debug.log'); }
}
function log(msg) {
  try { fs.appendFileSync(getLogPath(), `${new Date().toISOString()} ${msg}\r\n`); } catch (e) {}
}

// --- Single Instance Lock ---
const gotTheLock = app.requestSingleInstanceLock();
log(`SINGLE_INSTANCE_LOCK: ${gotTheLock}, argv: ${process.argv.join(' ')}`);
if (!gotTheLock) {
  log('QUITTING: another instance holds the lock');
  app.quit();
}

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
    path.join(process.cwd(), 'resources', 'trim_memory.exe'),
    'D:\\Program Files\\ClipBoardPro\\resources\\trim_memory.exe'
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
  } catch (e) {
    return path.join(process.cwd(), 'app-config.json');
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

// เพิ่มตัวแปรสำหรับ clipboard monitoring
let clipboardMonitorInterval;
let lastClipboardText = '';
let lastClipboardImage = '';
let lastImageSize = null;
let isMonitoringActive = false;
let isInternalCopy = false;
let internalCopyTimeout = null;

function markInternalCopy() {
  isInternalCopy = true;
  if (internalCopyTimeout) clearTimeout(internalCopyTimeout);
  internalCopyTimeout = setTimeout(() => {
    isInternalCopy = false;
  }, 1200);
}

function checkInternalCopyFlag() {
  return isInternalCopy;
}

function findIndexHtml() {
  const possiblePaths = [
    path.join(process.cwd(), 'dist-react', 'index.html'),
    path.join(__dirname, '../dist-react/index.html'),
    path.join(__dirname, '../../dist-react/index.html'),
    path.resolve('./dist-react/index.html')
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
  } catch (error) {
    return false;
  }
}

function initializeAutoStart() {
  try {
    const loginItemSettings = app.getLoginItemSettings();
    
    if (!loginItemSettings.openAtLogin) {
      setAutoStart(true);
    } else {
      openAtLogin = loginItemSettings.openAtLogin;
    }
  } catch (error) {
    setAutoStart(true);
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
  } catch (error) {
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

// ปรับปรุง Clipboard Monitoring ให้ตรวจสอบ global flag
function startClipboardMonitoring() {
  if (isMonitoringActive) return;
  isMonitoringActive = true;

  try {
    lastClipboardText = clipboard.readText();
    const image = clipboard.readImage();
    lastClipboardImage = image.isEmpty() ? '' : image.toDataURL();
  } catch (error) {
    // Silent error handling
  }
  
  clipboardMonitorInterval = setInterval(() => {
    if (!isMonitoringActive) return;
    if (isInternalCopy) return;
    
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
          mainWindow.webContents.send('clipboard-changed', {
            type: 'text',
            content: currentText,
            timestamp: new Date().toISOString()
          });
        }
      }

      // 2. ตรวจสอบ image (เร็ว: сначала проверяем форматы)
      const formats = clipboard.availableFormats();
      const hasImageFormat = formats.some(f => f.includes('image') || f === 'CF_DIB' || f === 'CF_BITMAP');
      if (hasImageFormat) {
        const currentImage = clipboard.readImage();
        if (!currentImage.isEmpty()) {
          const imgSize = currentImage.getSize();
          const sameAsLast = lastImageSize && 
                             lastImageSize.width === imgSize.width && 
                             lastImageSize.height === imgSize.height && 
                             lastClipboardImage !== '';
          if (!sameAsLast) {
            const imageDataURL = currentImage.toDataURL();
            if (imageDataURL && 
                imageDataURL !== lastClipboardImage && 
                imageDataURL !== '' &&
                imageDataURL.length > 100 &&
                imageDataURL.length < 50000000) {
              
              lastClipboardImage = imageDataURL;
              lastImageSize = imgSize;
              
              let thumbnailDataURL = imageDataURL;
              try {
                if (imgSize.height > 140) {
                  const targetWidth = Math.max(1, Math.round(imgSize.width * (140 / imgSize.height)));
                  thumbnailDataURL = currentImage.resize({ width: targetWidth, height: 140, quality: 'better' }).toDataURL();
                }
              } catch (e) {}
              
              const filePath = saveImageToDisk(currentImage);
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('clipboard-changed', {
                  type: 'image',
                  content: filePath,
                  thumbnail: thumbnailDataURL,
                  timestamp: new Date().toISOString()
                });
              }
            }
          }
        }
      }
    } catch (error) {
      // Silent error handling
    }
  }, 500);
}

function stopClipboardMonitoring() {
  isMonitoringActive = false;
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
          mainWindow.webContents.send('clear-all-shortcut');
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
  } catch (error) {
    // Silent error handling
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
  } catch (error) {
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
    if (!image.isEmpty()) {
      const imgSize = image.getSize();
      const sameAsLast = lastImageSize && 
                         lastImageSize.width === imgSize.width && 
                         lastImageSize.height === imgSize.height && 
                         lastClipboardImage !== '';
      if (!sameAsLast) {
        const imageDataURL = image.toDataURL();
        if (imageDataURL && imageDataURL !== lastClipboardImage && imageDataURL.length > 100) {
          lastClipboardImage = imageDataURL;
          lastImageSize = imgSize;
          
          let thumbnailDataURL = imageDataURL;
          try {
            if (imgSize.height > 140) {
              const targetWidth = Math.max(1, Math.round(imgSize.width * (140 / imgSize.height)));
              thumbnailDataURL = image.resize({ width: targetWidth, height: 140, quality: 'better' }).toDataURL();
            }
          } catch (e) {}
          
          const filePath = saveImageToDisk(image);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('clipboard-changed', {
              type: 'image',
              content: filePath,
              thumbnail: thumbnailDataURL,
              timestamp: new Date().toISOString()
            });
          }
        }
      }
    }
  } catch (error) {
    // Silent error handling
  }
}

function createTray() {
  if (tray) {
    try { tray.destroy(); } catch (e) {}
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

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = findIndexHtml();
    if (indexPath) {
      mainWindow.loadFile(indexPath);
    } else {
      mainWindow.loadURL('file://' + path.join(process.cwd(), 'dist-react', 'index.html'));
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

  // Window controls
  ipcMain.handle('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.handle('window-maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.handle('window-close', () => {
    if (mainWindow) {
      if (closeBehavior === 'minimize') {
        hideWindow();
      } else {
        quitApp();
      }
    }
  });

  ipcMain.handle('window-is-maximized', () => {
    return mainWindow ? mainWindow.isMaximized() : false;
  });

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximized', false);
  });

  ipcMain.handle('trim-memory', () => {
    trimMemory();
    return true;
  });

  ipcMain.handle('open-external', async (_event, url) => {
    await shell.openExternal(url);
  });

  createTray();
}

app.whenReady().then(() => {
  initializeAutoStart();
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

app.on('before-quit', (e) => {
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

// IPC handlers สำหรับ clipboard
ipcMain.handle('start-clipboard-monitoring', () => {
  startClipboardMonitoring();
  return true;
});

ipcMain.handle('stop-clipboard-monitoring', () => {
  stopClipboardMonitoring();
  return true;
});

ipcMain.handle('get-clipboard-text', () => {
  try {
    return clipboard.readText();
  } catch (error) {
    return '';
  }
});

ipcMain.handle('get-clipboard-image', () => {
  try {
    const image = clipboard.readImage();
    return image.isEmpty() ? null : image.toDataURL();
  } catch (error) {
    return null;
  }
});

// ปรับปรุง IPC handlers สำหรับ set clipboard - ไม่ต้องใช้ internal flags แล้ว
ipcMain.handle('set-clipboard-text', (event, text) => {
  try {
    markInternalCopy();
    lastClipboardText = text;
    clipboard.writeText(text);
    return true;
  } catch (error) {
    return false;
  }
});

ipcMain.handle('set-clipboard-image', (event, imageSource) => {
  try {
    markInternalCopy();
    lastClipboardImage = imageSource;
    let image;
    if (typeof imageSource === 'string' && (imageSource.startsWith('data:image/') || imageSource.includes('base64'))) {
      image = nativeImage.createFromDataURL(imageSource);
    } else if (typeof imageSource === 'string' && fs.existsSync(imageSource)) {
      image = nativeImage.createFromPath(imageSource);
    } else {
      image = nativeImage.createFromDataURL(imageSource);
    }
    lastImageSize = image.getSize();
    clipboard.writeImage(image);
    return true;
  } catch (error) {
    return false;
  }
});

// IPC handlers for media storage lifecycle (ADR-0002)
ipcMain.handle('media:delete', async (event, filePath) => {
  try {
    if (filePath && typeof filePath === 'string' && fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      return true;
    }
  } catch (e) {}
  return false;
});

ipcMain.handle('media:clear-all', async () => {
  try {
    if (fs.existsSync(mediaDir)) {
      const files = await fs.promises.readdir(mediaDir);
      for (const f of files) {
        if (f.endsWith('.png')) {
          await fs.promises.unlink(path.join(mediaDir, f)).catch(() => {});
        }
      }
    }
    return true;
  } catch (e) {}
  return false;
});

ipcMain.handle('media:reconcile', async (event, activeFilePaths) => {
  try {
    if (fs.existsSync(mediaDir) && Array.isArray(activeFilePaths)) {
      const activeSet = new Set(activeFilePaths.map(p => path.normalize(p).toLowerCase()));
      const files = await fs.promises.readdir(mediaDir);
      for (const f of files) {
        if (f.endsWith('.png')) {
          const full = path.normalize(path.join(mediaDir, f)).toLowerCase();
          if (!activeSet.has(full)) {
            await fs.promises.unlink(path.join(mediaDir, f)).catch(() => {});
          }
        }
      }
    }
    return true;
  } catch (e) {}
  return false;
});

// IPC handler สำหรับ close behavior setting
ipcMain.handle('set-close-behavior', (event, behavior) => {
  closeBehavior = behavior;
  saveConfig();
  return true;
});

ipcMain.handle('get-close-behavior', () => {
  return closeBehavior;
});

// IPC handlers สำหรับ start minimized setting
ipcMain.handle('set-start-minimized', (event, minimized) => {
  startMinimized = minimized;
  saveConfig();
  
  if (openAtLogin) {
    setAutoStart(true);
  }
  
  return true;
});

ipcMain.handle('get-start-minimized', () => {
  return startMinimized;
});

// IPC handlers สำหรับ Auto Start
ipcMain.handle('set-auto-start', (event, enabled) => {
  return setAutoStart(enabled);
});

ipcMain.handle('get-auto-start', () => {
  const status = getAutoStartStatus();
  return status.openAtLogin;
});

ipcMain.handle('get-auto-start-status', () => {
  return getAutoStartStatus();
});

// IPC handlers สำหรับ hotkeys
ipcMain.handle('update-hotkeys', (event, newHotkeys) => {
  hotkeys = { ...hotkeys, ...newHotkeys };
  registerGlobalShortcuts();
  return true;
});

ipcMain.handle('get-hotkeys', () => {
  return hotkeys;
});