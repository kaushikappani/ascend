import type { AscendApi } from '@shared/api';

declare global {
  interface Window {
    ascend: AscendApi;
  }
}

export {};
