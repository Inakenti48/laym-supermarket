import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc, query, where, Timestamp } from 'firebase/firestore';

// Firebase configuration
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

// Локальные пользователи (всегда работают)
const LOCAL_USERS: Record<string, { role: AppRole; name: string }> = {
  '8080': { role: 'admin', name: 'Администратор' },
  '1111': { role: 'admin', name: 'Админ' },
  '2222': { role: 'cashier', name: 'Кассир 1' },
  '3333': { role: 'cashier2', name: 'Кассир 2' },
  '4444': { role: 'inventory', name: 'Товаровед' },
};

// Хэширование для сравнения логинов
async function hashLogin(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
}

// Вход через Firebase с локальным фоллбэком
export const loginWithFirebase = async (login: string): Promise<{
  success: boolean;
  session?: AppSession;
  userName?: string;
  error?: string;
}> => {
  try {
    const loginHash = await hashLogin(login);
    
    // Пробуем Firebase с таймаутом 5 сек
    const firebasePromise = (async () => {
      const usersRef = collection(firebaseDb, 'user_logins');
      const snapshot = await getDocs(usersRef);
      
      for (const docSnap of snapshot.docs) {
        const userData = docSnap.data() as FirebaseUser;
        const userLoginHash = await hashLogin(userData.login);
        
        if (userLoginHash === loginHash) {
          // Удаляем старые сессии
          const sessionsRef = collection(firebaseDb, 'user_sessions');
          const oldSessionsQuery = query(sessionsRef, where('userId', '==', docSnap.id));
          const oldSessions = await getDocs(oldSessionsQuery);
          
          for (const oldSession of oldSessions.docs) {
            await deleteDoc(doc(firebaseDb, 'user_sessions', oldSession.id));
          }
          
          // Создаём новую сессию
          const sessionId = crypto.randomUUID();
          const session: AppSession = {
            userId: docSnap.id,
            role: userData.role,
            login: userData.login,
            loginTime: Date.now(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            source: 'firebase'
          };
          
          await setDoc(doc(firebaseDb, 'user_sessions', sessionId), session);
          localStorage.setItem('app_session', JSON.stringify({ ...session, sessionId }));
          
          return { success: true, session, userName: userData.name };
        }
      }
      
      return { success: false, error: 'not_found' };
    })();
    
    const timeoutPromise = new Promise<{ success: false; error: string }>((resolve) => 
      setTimeout(() => resolve({ success: false, error: 'firebase_timeout' }), 5000)
    );
    
    const firebaseResult = await Promise.race([firebasePromise, timeoutPromise]);
    
    if (firebaseResult.success) {
      return firebaseResult;
    }
    
    console.log('⚠️ Firebase недоступен или пользователь не найден, используем локальный вход');
    
  } catch (error) {
    console.warn('⚠️ Ошибка Firebase:', error);
  }
  
  // Локальный вход
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
    
    return { success: true, session, userName: localData.name };
  }
  
  return { success: false, error: 'Неверный логин' };
};

// Получение текущей сессии
export const getCurrentSession = (): AppSession | null => {
  try {
    const stored = localStorage.getItem('app_session');
    if (!stored) return null;
    
    const session: AppSession = JSON.parse(stored);
    
    // Проверяем срок действия
    if (new Date(session.expiresAt) > new Date()) {
      return session;
    }
    
    // Сессия истекла
    localStorage.removeItem('app_session');
    return null;
  } catch (error) {
    console.warn('⚠️ Ошибка чтения сессии:', error);
    return null;
  }
};

// Выход
export const logoutFirebase = async (): Promise<void> => {
  try {
    const stored = localStorage.getItem('app_session');
    if (stored) {
      const session = JSON.parse(stored);
      if (session.sessionId) {
        await deleteDoc(doc(firebaseDb, 'user_sessions', session.sessionId));
      }
    }
  } catch (error) {
    console.warn('⚠️ Ошибка выхода:', error);
  } finally {
    localStorage.removeItem('app_session');
  }
};

// Инициализация пользователей в Firebase (один раз)
export const initFirebaseUsers = async (): Promise<{ success: boolean; message: string }> => {
  const defaultUsers: Omit<FirebaseUser, 'id'>[] = [
    { login: '8080', role: 'admin', name: 'Администратор' },
    { login: '1111', role: 'admin', name: 'Админ' },
    { login: '2222', role: 'cashier', name: 'Кассир 1' },
    { login: '3333', role: 'cashier2', name: 'Кассир 2' },
    { login: '4444', role: 'inventory', name: 'Товаровед' },
  ];
  
  try {
    // Проверяем есть ли уже пользователи
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
    console.error('❌ Ошибка инициализации Firebase:', error);
    return { success: false, message: error.message || 'Ошибка Firebase' };
  }
};
