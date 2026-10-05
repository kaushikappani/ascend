import type { AscendApi } from '@shared/api';

export const api: AscendApi = window.ascend;

export function errorText(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}
