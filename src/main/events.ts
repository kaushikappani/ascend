// Main → renderer event bus, plus desktop notifications.
import { BrowserWindow, Notification } from 'electron';
import { EVENT_CHANNELS, type EventMap, type NavigateEvent } from '@shared/api';
import type { Toast } from '@shared/types';
import { store } from './store';
import { uid } from './util';

export function emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(EVENT_CHANNELS[event], payload);
  }
}

export function toast(t: Omit<Toast, 'id'>): void {
  emit('toast', { ...t, id: uid('tst_') });
}

/** OS notification when the window isn't focused (e.g. company research finished in the background). */
export function notify(title: string, body: string, route?: NavigateEvent): void {
  if (!store.data.settings.notifications || !Notification.isSupported()) return;
  const focused = BrowserWindow.getAllWindows().some((w) => w.isFocused());
  if (focused) return;
  const n = new Notification({ title, body, silent: false });
  n.on('click', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
    if (route) emit('navigate', route);
  });
  n.show();
}

let snapshotTimer: NodeJS.Timeout | null = null;

/** Coalesce bursts of store mutations into one snapshot push. */
export function scheduleSnapshot(): void {
  if (snapshotTimer) return;
  snapshotTimer = setTimeout(() => {
    snapshotTimer = null;
    emit('snapshot', store.snapshot());
  }, 40);
}
