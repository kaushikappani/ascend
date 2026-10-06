// Ascend — Electron main process entry.
import { app, BrowserWindow, Menu, nativeTheme, shell } from 'electron';
import path from 'node:path';
import icon from '../../resources/icon.png?asset';
import { checkConnection } from './agent/runtime';
import { refreshStreak } from './engine/gamification';
import { scheduleSnapshot } from './events';
import { registerIpc, TITLEBAR } from './ipc';
import { jobs } from './jobs';
import { shutdownChats } from './services/chat';
import { shutdownInterviews } from './services/interviews';
import { cleanupPrefetched, prefetchNext, resumeInterruptedLessons } from './services/lessons';
import { store } from './store';

app.setName('Ascend');
if (process.platform === 'win32') app.setAppUserModelId('com.ascend.interviewcoach');
// Optional isolated profile (handy for testing without touching your real progress).
if (process.env.ASCEND_USER_DATA) app.setPath('userData', process.env.ASCEND_USER_DATA);

let win: BrowserWindow | null = null;

function resolvedTheme(): 'light' | 'dark' {
  const pref = store.data.settings.theme;
  if (pref === 'system') return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  return pref;
}

function createWindow(): void {
  const colors = TITLEBAR[resolvedTheme()];
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    title: 'Ascend',
    icon,
    backgroundColor: colors.color,
    // Windows draws its controls over the app's own top bar; macOS keeps its native title bar
    // so the traffic lights never sit on top of the sidebar or the lesson header.
    titleBarStyle: process.platform === 'darwin' ? 'default' : 'hidden',
    titleBarOverlay: process.platform === 'win32' ? { ...colors, height: 48 } : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(import.meta.dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });

  win.once('ready-to-show', () => win?.show());
  win.on('closed', () => {
    win = null;
  });

  // Links open in the default browser; the app itself never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url === win?.webContents.getURL()) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  });
  win.webContents.on('before-input-event', (_event, input) => {
    const devtools = input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i');
    if (input.type === 'keyDown' && devtools) win?.webContents.toggleDevTools();
  });

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(path.join(import.meta.dirname, '../renderer/index.html'));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  void app.whenReady().then(() => {
    store.init();
    store.mutate((d) => refreshStreak(d));
    cleanupPrefetched();
    store.onChange(() => scheduleSnapshot());
    registerIpc(() => win);
    // macOS routes Cmd+C/V/Q through the app menu, so it keeps the standard one.
    Menu.setApplicationMenu(
      process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]) : null,
    );
    createWindow();

    nativeTheme.on('updated', () => {
      if (store.data.settings.theme !== 'system' || !win || process.platform !== 'win32') return;
      win.setTitleBarOverlay({ ...TITLEBAR[resolvedTheme()], height: 48 });
    });

    // Verify Claude Code in the background, finish lessons cut off by the last close, then warm up the next lesson.
    setTimeout(() => void checkConnection(), 600);
    setTimeout(() => {
      if (!store.data.profile.onboarded) return;
      resumeInterruptedLessons();
      const trackId = store.data.profile.activeTrackId;
      if (trackId) prefetchNext(trackId);
    }, 5000);
  });

  app.on('window-all-closed', () => app.quit());

  app.on('before-quit', () => {
    jobs.cancelAll();
    shutdownInterviews();
    shutdownChats();
    store.saveNow();
  });
}
