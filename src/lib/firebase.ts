import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc, query, where, Timestamp, enableIndexedDbPersistence } from 'firebase/firestore';

/**
 * Firebase configuration for authentication
 * 
 * ЛОГИНЫ ДЛЯ ВХОДА:
 * - 8080 — Администратор (admin)
 * - 1020 — Кассир 1 (cashier)
 * - 2030 — Кассир 2 (cashier2)
 * - 3040 — Склад (inventory)
 */
const firebaseConfig = {
  apiKey: "AIzaSyD08oNtISN8Rtc_hOOH9DxHTTUSiUsKbdE",
  authDomain: "laym-c9f65.firebaseapp.com",
  projectId: "laym-c9f65",
  storageBucket: "laym-c9f65.firebasestorage.app",
  messagingSenderId: "470802255674",
  appId: "1:470802255674:web:f0537e279c3eceff328a03",
  measurementId: "G-T818ZT4NBV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const firebaseDb = getFirestore(app);

// Включаем офлайн кэширование для быстродействия
enableIndexedDbPersistence(firebaseDb).catch((err) => {
  console.warn('⚠️ Офлайн кэш не включен:', err.code);
});

export type AppRole = 'admin' | 'cashier' | 'cashier2' | 'inventory' | 'employee';

export interface AppSession {
  userId: string;
  role: AppRole;
  login: string;
  loginTime: number;
  expiresAt: string;
  source?: 'firebase' | 'local';
}

export interface FirebaseUser {
  id: string;
  login: string;
  role: AppRole;
  name: string;
  createdAt?: Timestamp;
}

// Локальные пользователи (работают всегда, даже без Firebase)
const LOCAL_USERS: Record<string, { role: AppRole; name: string }> = {
  '8080': { role: 'admin', name: 'Администратор' },
  '1020': { role: 'cashier', name: 'Кассир 1' },
  '2030': { role: 'cashier2', name: 'Кассир 2' },
  '3040': { role: 'inventory', name: 'Склад' },
};

// Быстрый вход (сначала локально, потом Firebase в фоне)
export const loginWithFirebase = async (login: string): Promise<{
  success: boolean;
  session?: AppSession;
  userName?: string;
  error?: string;
}> => {
  // Быстрый локальный вход (мгновенно)
  if (LOCAL_USERS[login]) {
    const localData = LOCAL_USERS[login];
    const session: AppSession = {
      userId: `local-${login}`,
      role: localData.role,
      login: login,
      loginTime: Date.now(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      source: 'local'
    };
    
    localStorage.setItem('app_session', JSON.stringify(session));
    
    // Фоновая синхронизация с Firebase (не блокирует вход)
    syncWithFirebase(login).catch(console.warn);
    
    return { success: true, session, userName: localData.name };
  }
  
  // Если не локальный - пробуем Firebase
  try {
    const usersRef = collection(firebaseDb, 'user_logins');
    const snapshot = await Promise.race([
      getDocs(usersRef),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('timeout')), 3000)
      )
    ]);
    
    for (const docSnap of snapshot.docs) {
      const userData = docSnap.data() as FirebaseUser;
      
      if (userData.login === login) {
        const session: AppSession = {
          userId: docSnap.id,
          role: userData.role,
          login: userData.login,
          loginTime: Date.now(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          source: 'firebase'
        };
        
        localStorage.setItem('app_session', JSON.stringify(session));
        return { success: true, session, userName: userData.name };
      }
    }
    
    return { success: false, error: 'Неверный логин' };
  } catch (error: any) {
    console.warn('⚠️ Firebase недоступен:', error.message);
    return { success: false, error: 'Неверный логин' };
  }
};

// Фоновая синхронизация с Firebase
async function syncWithFirebase(login: string): Promise<void> {
  try {
    const usersRef = collection(firebaseDb, 'user_logins');
    const snapshot = await getDocs(usersRef);
    
    for (const docSnap of snapshot.docs) {
      const userData = docSnap.data() as FirebaseUser;
      if (userData.login === login) {
        // Обновляем сессию на Firebase-версию
        const stored = localStorage.getItem('app_session');
        if (stored) {
          const session = JSON.parse(stored);
          session.userId = docSnap.id;
          session.source = 'firebase';
          localStorage.setItem('app_session', JSON.stringify(session));
        }
        break;
      }
    }
  } catch (error) {
    // Игнорируем ошибки синхронизации
  }
}

// Получение текущей сессии (мгновенно из localStorage)
export const getCurrentSession = (): AppSession | null => {
  try {
    const stored = localStorage.getItem('app_session');
    if (!stored) return null;
    
    const session: AppSession = JSON.parse(stored);
    
    if (new Date(session.expiresAt) > new Date()) {
      return session;
    }
    
    localStorage.removeItem('app_session');
    return null;
  } catch {
    return null;
  }
};

// Выход (быстрый)
export const logoutFirebase = async (): Promise<void> => {
  localStorage.removeItem('app_session');
  
  // Фоновая очистка в Firebase
  try {
    const stored = localStorage.getItem('app_session');
    if (stored) {
      const session = JSON.parse(stored);
      if (session.sessionId) {
        deleteDoc(doc(firebaseDb, 'user_sessions', session.sessionId)).catch(() => {});
      }
    }
  } catch {}
};

// Инициализация пользователей в Firebase
export const initFirebaseUsers = async (): Promise<{ success: boolean; message: string }> => {
  const defaultUsers: Omit<FirebaseUser, 'id'>[] = [
    { login: '8080', role: 'admin', name: 'Администратор' },
    { login: '1020', role: 'cashier', name: 'Кассир 1' },
    { login: '2030', role: 'cashier2', name: 'Кассир 2' },
    { login: '3040', role: 'inventory', name: 'Склад' },
  ];
  
  try {
    const usersRef = collection(firebaseDb, 'user_logins');
    const existing = await getDocs(usersRef);
    
    if (existing.size > 0) {
      return { success: true, message: `Пользователи уже существуют (${existing.size})` };
    }
    
    for (const user of defaultUsers) {
      const userId = crypto.randomUUID();
      await setDoc(doc(firebaseDb, 'user_logins', userId), {
        ...user,
        createdAt: Timestamp.now()
      });
    }
    
    return { success: true, message: `Создано ${defaultUsers.length} пользователей` };
  } catch (error: any) {
    console.error('❌ Ошибка Firebase:', error);
    return { success: false, message: error.message || 'Firestore не создан. Создайте базу в Firebase Console.' };
  }
};
