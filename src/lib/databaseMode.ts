// Управление режимом базы данных - только MySQL
export type DatabaseMode = 'mysql';

const STORAGE_KEY = 'database_mode';

export const getDatabaseMode = (): DatabaseMode => {
  // Всегда возвращаем MySQL
  return 'mysql';
};

export const setDatabaseMode = (mode: DatabaseMode): void => {
  localStorage.setItem(STORAGE_KEY, 'mysql');
  window.dispatchEvent(new CustomEvent('database-mode-changed', { detail: 'mysql' }));
};

export const subscribeToDatabaseMode = (callback: (mode: DatabaseMode) => void): () => void => {
  const handler = (e: Event) => {
    callback('mysql');
  };
  window.addEventListener('database-mode-changed', handler);
  return () => window.removeEventListener('database-mode-changed', handler);
};

export const getDatabaseLabel = (mode: DatabaseMode): string => {
  return 'MySQL';
};
