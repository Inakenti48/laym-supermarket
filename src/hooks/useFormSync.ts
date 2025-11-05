import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { debounce } from 'lodash';

interface FormState {
  barcode?: string;
  name?: string;
  category?: string;
  supplier?: string;
  purchasePrice?: string;
  retailPrice?: string;
  quantity?: string;
  unit?: string;
  expiryDate?: string;
}

interface OtherUserFormState extends FormState {
  userId: string;
  userName: string;
  lastUpdated: string;
}

export const useFormSync = (currentFormState: FormState, isAdmin: boolean) => {
  const [otherUsersStates, setOtherUsersStates] = useState<OtherUserFormState[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const formStateIdRef = useRef<string | null>(null);
  const isInitializedRef = useRef(false);

  // Получаем текущего пользователя
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUser(user);
      }
    };
    getCurrentUser();
  }, []);

  // Debounced функция для обновления состояния формы
  const updateFormState = useCallback(
    debounce(async (formData: FormState, userId: string, userName: string) => {
      if (!isAdmin || !userId) return;

      try {
        // Проверяем, есть ли уже запись для этого пользователя
        const { data: existing } = await supabase
          .from('product_form_state')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        const dataToSave = {
          user_id: userId,
          user_name: userName,
          barcode: formData.barcode || null,
          name: formData.name || null,
          category: formData.category || null,
          supplier: formData.supplier || null,
          purchase_price: formData.purchasePrice ? Number(formData.purchasePrice) : null,
          retail_price: formData.retailPrice ? Number(formData.retailPrice) : null,
          quantity: formData.quantity ? Number(formData.quantity) : null,
          unit: formData.unit || null,
          expiry_date: formData.expiryDate || null,
          last_updated: new Date().toISOString()
        };

        if (existing) {
          // Обновляем существующую запись
          await supabase
            .from('product_form_state')
            .update(dataToSave)
            .eq('id', existing.id);
          
          formStateIdRef.current = existing.id;
        } else {
          // Создаем новую запись
          const { data: newRecord } = await supabase
            .from('product_form_state')
            .insert(dataToSave)
            .select('id')
            .single();
          
          if (newRecord) {
            formStateIdRef.current = newRecord.id;
          }
        }
      } catch (error) {
        console.error('Ошибка синхронизации формы:', error);
      }
    }, 500),
    [isAdmin]
  );

  // Синхронизируем текущее состояние формы
  useEffect(() => {
    if (!isAdmin || !currentUser || !isInitializedRef.current) return;

    const userName = currentUser.email?.split('@')[0] || 'Админ';
    updateFormState(currentFormState, currentUser.id, userName);
  }, [currentFormState, currentUser, isAdmin, updateFormState]);

  // Подписываемся на изменения от других пользователей
  useEffect(() => {
    if (!isAdmin || !currentUser) return;

    isInitializedRef.current = true;

    // Загружаем текущие состояния других пользователей
    const loadOtherUsersStates = async () => {
      const { data, error } = await supabase
        .from('product_form_state')
        .select('*')
        .neq('user_id', currentUser.id);

      if (!error && data) {
        const mappedStates: OtherUserFormState[] = data.map(state => ({
          userId: state.user_id,
          userName: state.user_name,
          barcode: state.barcode || undefined,
          name: state.name || undefined,
          category: state.category || undefined,
          supplier: state.supplier || undefined,
          purchasePrice: state.purchase_price?.toString() || undefined,
          retailPrice: state.retail_price?.toString() || undefined,
          quantity: state.quantity?.toString() || undefined,
          unit: state.unit || undefined,
          expiryDate: state.expiry_date || undefined,
          lastUpdated: state.last_updated
        }));
        setOtherUsersStates(mappedStates);
      }
    };

    loadOtherUsersStates();

    // Подписываемся на realtime обновления
    const channel = supabase
      .channel('form_state_sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'product_form_state'
        },
        (payload: any) => {
          // Игнорируем свои собственные изменения
          if (payload.new?.user_id === currentUser.id) return;

          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newState: OtherUserFormState = {
              userId: payload.new.user_id,
              userName: payload.new.user_name,
              barcode: payload.new.barcode || undefined,
              name: payload.new.name || undefined,
              category: payload.new.category || undefined,
              supplier: payload.new.supplier || undefined,
              purchasePrice: payload.new.purchase_price?.toString() || undefined,
              retailPrice: payload.new.retail_price?.toString() || undefined,
              quantity: payload.new.quantity?.toString() || undefined,
              unit: payload.new.unit || undefined,
              expiryDate: payload.new.expiry_date || undefined,
              lastUpdated: payload.new.last_updated
            };

            setOtherUsersStates(prev => {
              const filtered = prev.filter(s => s.userId !== newState.userId);
              return [...filtered, newState];
            });
          } else if (payload.eventType === 'DELETE') {
            setOtherUsersStates(prev => 
              prev.filter(s => s.userId !== payload.old.user_id)
            );
          }
        }
      )
      .subscribe();

    // Очистка при размонтировании
    return () => {
      supabase.removeChannel(channel);
      
      // Удаляем свое состояние формы
      if (formStateIdRef.current) {
        supabase
          .from('product_form_state')
          .delete()
          .eq('id', formStateIdRef.current)
          .then(() => {
            console.log('Состояние формы очищено');
          });
      }
    };
  }, [isAdmin, currentUser]);

  return { otherUsersStates };
};
