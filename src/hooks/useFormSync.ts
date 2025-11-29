import { useState } from 'react';

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

// Синхронизация форм отключена после миграции на Firebase
// Для синхронизации используется localStorage
export const useFormSync = (_currentFormState: FormState, _isAdmin: boolean) => {
  const [otherUsersStates] = useState<OtherUserFormState[]>([]);
  
  return { otherUsersStates };
};
