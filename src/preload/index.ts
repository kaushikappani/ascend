// Sandboxed preload: exposes a typed, promise-based API as window.ascend.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { EVENT_CHANNELS, RPC_CHANNEL, RPC_METHODS, type AscendApi } from '@shared/api';

async function invoke(method: string, args: unknown[]): Promise<unknown> {
  const res = (await ipcRenderer.invoke(RPC_CHANNEL, method, args)) as { ok: boolean; value?: unknown; error?: string };
  if (!res.ok) throw new Error(res.error ?? 'Something went wrong.');
  return res.value;
}

const api: Record<string, unknown> = {};

for (const [group, methods] of Object.entries(RPC_METHODS)) {
  const bound: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  for (const method of methods) bound[method] = (...args: unknown[]) => invoke(`${group}.${method}`, args);
  api[group] = bound;
}

const on: Record<string, (cb: (payload: unknown) => void) => () => void> = {};
for (const [event, channel] of Object.entries(EVENT_CHANNELS)) {
  on[event] = (cb) => {
    const listener = (_e: IpcRendererEvent, payload: unknown) => cb(payload);
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  };
}
api.on = on;

contextBridge.exposeInMainWorld('ascend', api as unknown as AscendApi);
