// Управление режимом базы данных
export type DatabaseMode = 'mysql' | 'postgresql';

const STORAGE_KEY = 'database_mode';

export const getDatabaseMode = (): DatabaseMode => {
  const stored = localStorage.getItem(STORAGE_KEY);
  return (stored === 'postgresql' ? 'postgresql' : 'mysql') as DatabaseMode;
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
