// Управление режимом базы данных
export type DatabaseMode = 'mysql' | 'postgresql' | 'external_pg';

const STORAGE_KEY = 'database_mode';

export const getDatabaseMode = (): DatabaseMode => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'postgresql') return 'postgresql';
  if (stored === 'external_pg') return 'external_pg';
  return 'mysql';
};

export const setDatabaseMode = (mode: DatabaseMode): void => {
  localStorage.setItem(STORAGE_KEY, mode);
  window.dispatchEvent(new CustomEvent('database-mode-changed', { detail: mode }));
};

export const subscribeToDatabaseMode = (callback: (mode: DatabaseMode) => void): () => void => {
  const handler = (e: Event) => {
    callback((e as CustomEvent).detail);
  };
  window.addEventListener('database-mode-changed', handler);
  return () => window.removeEventListener('database-mode-changed', handler);
};

export const getDatabaseLabel = (mode: DatabaseMode): string => {
  switch (mode) {
    case 'mysql': return 'MySQL';
    case 'postgresql': return 'Cloud PG';
    case 'external_pg': return 'External PG';
  }
};
