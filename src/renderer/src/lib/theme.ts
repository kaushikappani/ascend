import { useEffect, useState } from 'react';
import type { ThemeMode } from '@shared/types';
import { api } from './api';
import { useApp } from './store';

function systemDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function effectiveTheme(mode: ThemeMode | undefined): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode;
  return systemDark() ? 'dark' : 'light';
}

/** Applies the theme to the document and the native Windows title bar. */
export function useThemeSync(): 'light' | 'dark' {
  const mode = useApp((s) => s.snapshot?.settings.theme);
  const [theme, setTheme] = useState(() => effectiveTheme(mode));
  useEffect(() => {
    const apply = () => setTheme(effectiveTheme(mode));
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [mode]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    void api.app.setTitleBarTheme(theme).catch(() => undefined);
  }, [theme]);
  return theme;
}
