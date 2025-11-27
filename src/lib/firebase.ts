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

export interface FirebaseUser {
  id: string;
  login: string;
  role: AppRole;
  name: string;
  createdAt?: Timestamp;
}

export interface FirebaseSession {
  id: string;
  userId: string;
  role: AppRole;
  login: string;
  loginTime: number;
  expiresAt: string;
}

// Хэширование MD5 (для совместимости с существующей системой)
async function hashLogin(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
}

// Проверка доступности Firebase
export const checkFirebaseConnection = async (): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const usersRef = collection(firebaseDb, 'user_logins');
    await getDocs(usersRef);
    
    clearTimeout(timeoutId);
    return true;
  } catch (error) {
    console.warn('⚠️ Firebase недоступен:', error);
    return false;
  }
};

// Вход через Firebase
export const loginWithFirebase = async (login: string): Promise<{
  success: boolean;
  role?: AppRole;
  userId?: string;
  sessionId?: string;
  error?: string;
}> => {
  try {
    const loginHash = await hashLogin(login);
    
    // Ищем пользователя по хэшу логина
    const usersRef = collection(firebaseDb, 'user_logins');
    const snapshot = await getDocs(usersRef);
    
    let foundUser: FirebaseUser | null = null;
    
    for (const docSnap of snapshot.docs) {
      const userData = docSnap.data() as FirebaseUser;
      const userLoginHash = await hashLogin(userData.login);
      
      if (userLoginHash === loginHash) {
        foundUser = { ...userData, id: docSnap.id };
        break;
      }
    }
    
    if (!foundUser) {
      return { success: false, error: 'Пользователь не найден' };
    }
    
    // Удаляем старые сессии пользователя
    const sessionsRef = collection(firebaseDb, 'user_sessions');
    const oldSessionsQuery = query(sessionsRef, where('userId', '==', foundUser.id));
    const oldSessions = await getDocs(oldSessionsQuery);
    
    for (const oldSession of oldSessions.docs) {
      await deleteDoc(doc(firebaseDb, 'user_sessions', oldSession.id));
    }
    
    // Создаём новую сессию
    const sessionId = crypto.randomUUID();
    const sessionData: Omit<FirebaseSession, 'id'> = {
      userId: foundUser.id,
      role: foundUser.role,
      login: foundUser.login,
      loginTime: Date.now(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };
    
    await setDoc(doc(firebaseDb, 'user_sessions', sessionId), sessionData);
    
    // Сохраняем сессию локально
    localStorage.setItem('firebase_session_id', sessionId);
    
    return {
      success: true,
      role: foundUser.role,
      userId: foundUser.id,
      sessionId
    };
  } catch (error: any) {
    console.error('❌ Ошибка входа Firebase:', error);
    return { success: false, error: error.message || 'Ошибка Firebase' };
  }
};

// Получение текущей сессии Firebase
export const getFirebaseSession = async (): Promise<FirebaseSession | null> => {
  try {
    const sessionId = localStorage.getItem('firebase_session_id');
    if (!sessionId) return null;
    
    const sessionsRef = collection(firebaseDb, 'user_sessions');
    const snapshot = await getDocs(sessionsRef);
    
    for (const docSnap of snapshot.docs) {
      if (docSnap.id === sessionId) {
        const data = docSnap.data();
        const session: FirebaseSession = {
          id: docSnap.id,
          userId: data.userId,
          role: data.role,
          login: data.login,
          loginTime: data.loginTime,
          expiresAt: data.expiresAt
        };
        
        // Проверяем срок действия
        if (new Date(session.expiresAt) > new Date()) {
          return session;
        } else {
          // Сессия истекла
          await deleteDoc(doc(firebaseDb, 'user_sessions', sessionId));
          localStorage.removeItem('firebase_session_id');
          return null;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.warn('⚠️ Ошибка получения сессии Firebase:', error);
    return null;
  }
};

// Выход из Firebase
export const logoutFirebase = async (): Promise<void> => {
  try {
    const sessionId = localStorage.getItem('firebase_session_id');
    if (sessionId) {
      await deleteDoc(doc(firebaseDb, 'user_sessions', sessionId));
    }
  } catch (error) {
    console.warn('⚠️ Ошибка выхода Firebase:', error);
  } finally {
    localStorage.removeItem('firebase_session_id');
  }
};

// Инициализация базовых пользователей в Firebase (запустить один раз)
export const initFirebaseUsers = async (): Promise<void> => {
  const defaultUsers: Omit<FirebaseUser, 'id'>[] = [
    { login: '8080', role: 'admin', name: 'Администратор' },
    { login: '1111', role: 'admin', name: 'Админ' },
    { login: '2222', role: 'cashier', name: 'Кассир 1' },
    { login: '3333', role: 'cashier2', name: 'Кассир 2' },
    { login: '4444', role: 'inventory', name: 'Товаровед' },
  ];
  
  try {
    for (const user of defaultUsers) {
      const userId = crypto.randomUUID();
      await setDoc(doc(firebaseDb, 'user_logins', userId), {
        ...user,
        createdAt: Timestamp.now()
      });
    }
    console.log('✅ Firebase пользователи созданы');
  } catch (error) {
    console.error('❌ Ошибка инициализации Firebase:', error);
  }
};
