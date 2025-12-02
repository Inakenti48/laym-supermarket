import { useState, useEffect } from 'react';
import { DatabaseMode, getDatabaseMode, setDatabaseMode, subscribeToDatabaseMode, getDatabaseLabel } from '@/lib/databaseMode';

export function useDatabaseMode() {
  const [mode, setMode] = useState<DatabaseMode>(getDatabaseMode);

  useEffect(() => {
    const unsubscribe = subscribeToDatabaseMode(setMode);
    return unsubscribe;
  }, []);

  const toggleMode = () => {
    const modes: DatabaseMode[] = ['mysql', 'postgresql', 'external_pg'];
    const currentIndex = modes.indexOf(mode);
    const newMode = modes[(currentIndex + 1) % modes.length];
    setDatabaseMode(newMode);
  };

  const switchTo = (newMode: DatabaseMode) => {
    setDatabaseMode(newMode);
  };

  return { 
    mode, 
    toggleMode, 
    switchTo, 
    label: getDatabaseLabel(mode),
    isMySQL: mode === 'mysql', 
    isPostgreSQL: mode === 'postgresql',
    isExternalPG: mode === 'external_pg'
  };
}
