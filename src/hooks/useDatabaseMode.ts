import { useState, useEffect } from 'react';
import { DatabaseMode, getDatabaseMode, setDatabaseMode, subscribeToDatabaseMode } from '@/lib/databaseMode';

export function useDatabaseMode() {
  const [mode, setMode] = useState<DatabaseMode>(getDatabaseMode);

  useEffect(() => {
    const unsubscribe = subscribeToDatabaseMode(setMode);
    return unsubscribe;
  }, []);

  const toggleMode = () => {
    const newMode: DatabaseMode = mode === 'mysql' ? 'postgresql' : 'mysql';
    setDatabaseMode(newMode);
  };

  const switchTo = (newMode: DatabaseMode) => {
    setDatabaseMode(newMode);
  };

  return { mode, toggleMode, switchTo, isMySQL: mode === 'mysql', isPostgreSQL: mode === 'postgresql' };
}
