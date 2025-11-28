// Firebase аутентификация
import { firebaseDb } from './firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';

export type AppRole = 'admin' | 'cashier' | 'cashier2' | 'inventory' | 'employee';

interface FirebaseUser {
  id: string;
  login: string;
  password: string;
  role: AppRole;
  name: string;
  createdAt: string;
}

// Получить роль пользователя
export const getUserRole = async (userId: string): Promise<AppRole | null> => {
  try {
    const q = query(
      collection(firebaseDb, 'users'),
      where('id', '==', userId)
    );
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      return snapshot.docs[0].data().role as AppRole;
    }
    return null;
  } catch (error) {
    console.error('Ошибка получения роли:', error);
    return null;
  }
};

// Вход по логину и паролю
export const signIn = async (login: string, password: string): Promise<{ success: boolean; error?: string; user?: FirebaseUser }> => {
  try {
    const q = query(
      collection(firebaseDb, 'users'),
      where('login', '==', login),
      where('password', '==', password)
    );
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return { success: false, error: 'Неверный логин или пароль' };
    }
    
    const userData = snapshot.docs[0].data();
    const user: FirebaseUser = {
      id: snapshot.docs[0].id,
      login: userData.login,
      password: userData.password,
      role: userData.role,
      name: userData.name,
      createdAt: userData.createdAt
    };
    
    // Сохраняем сессию
    localStorage.setItem('firebase_session', JSON.stringify({
      userId: user.id,
      login: user.login,
      role: user.role,
      name: user.name,
      loginTime: new Date().toISOString()
    }));
    
    await logSystemAction(`Вход в систему: ${user.name}`);
    
    return { success: true, user };
  } catch (error: any) {
    console.error('Ошибка входа:', error);
    return { success: false, error: error.message || 'Ошибка входа' };
  }
};

// Регистрация нового пользователя
export const signUp = async (
  login: string,
  password: string,
  role: AppRole,
  name?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Проверяем, существует ли пользователь
    const q = query(
      collection(firebaseDb, 'users'),
      where('login', '==', login)
    );
    const existing = await getDocs(q);
    
    if (!existing.empty) {
      return { success: false, error: 'Пользователь уже существует' };
    }
    
    // Создаём нового пользователя
    await addDoc(collection(firebaseDb, 'users'), {
      login,
      password,
      role,
      name: name || login,
      createdAt: new Date().toISOString()
    });
    
    await logSystemAction(`Создан пользователь: ${login} (${role})`);
    
    return { success: true };
  } catch (error: any) {
    console.error('Ошибка регистрации:', error);
    return { success: false, error: error.message || 'Ошибка регистрации' };
  }
};

// Выход
export const signOut = async (): Promise<void> => {
  await logSystemAction('Выход из системы');
  localStorage.removeItem('firebase_session');
};

// Получить текущего пользователя
export const getCurrentUser = (): { userId: string; login: string; role: AppRole; name: string } | null => {
  const session = localStorage.getItem('firebase_session');
  if (!session) return null;
  
  try {
    return JSON.parse(session);
  } catch {
    return null;
  }
};

// Логирование действий
export const logSystemAction = async (message: string): Promise<void> => {
  try {
    const user = getCurrentUser();
    
    await addDoc(collection(firebaseDb, 'system_logs'), {
      message,
      userId: user?.userId || null,
      userName: user?.name || 'Система',
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    console.warn('⚠️ Не удалось записать лог:', error);
  }
};
