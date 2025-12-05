import { useState, useEffect } from 'react';
import { DatabaseMode, getDatabaseMode, setDatabaseMode, subscribeToDatabaseMode, getDatabaseLabel } from '@/lib/databaseMode';

export function useDatabaseMode() {
  const [mode] = useState<DatabaseMode>('mysql');

  return { 
    mode, 
    toggleMode: () => {}, 
    switchTo: () => {}, 
    label: 'MySQL',
    isMySQL: true, 
    isPostgreSQL: false,
    isExternalPG: false
  };
}
