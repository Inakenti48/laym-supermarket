// MySQL-based form drafts - no localStorage
import { mysqlRequest } from './mysqlDatabase';

export type FormType = 'inventory' | 'supplier' | 'payment' | 'cashier_cart' | 'quick_items';

interface FormDraft {
  id: string;
  user_id: string;
  form_type: string;
  data: any;
  updated_at: string;
}

// Cache for quick access
const draftsCache: Map<string, any> = new Map();

export const getFormDraft = async (userId: string, formType: FormType): Promise<any | null> => {
  const cacheKey = `${userId}_${formType}`;
  
  // Return from cache if available
  if (draftsCache.has(cacheKey)) {
    return draftsCache.get(cacheKey);
  }
  
  try {
    const result = await mysqlRequest<FormDraft>('get_form_draft', { user_id: userId, form_type: formType });
    if (result.success && result.data) {
      draftsCache.set(cacheKey, result.data.data);
      return result.data.data;
    }
    return null;
  } catch (error) {
    console.error('Error getting form draft:', error);
    return null;
  }
};

export const saveFormDraft = async (userId: string, formType: FormType, data: any): Promise<void> => {
  const cacheKey = `${userId}_${formType}`;
  
  // Update cache immediately
  draftsCache.set(cacheKey, data);
  
  // Save to MySQL in background
  try {
    await mysqlRequest('save_form_draft', { user_id: userId, form_type: formType, data });
  } catch (error) {
    console.error('Error saving form draft:', error);
  }
};

export const deleteFormDraft = async (userId: string, formType: FormType): Promise<void> => {
  const cacheKey = `${userId}_${formType}`;
  
  // Remove from cache
  draftsCache.delete(cacheKey);
  
  // Delete from MySQL
  try {
    await mysqlRequest('delete_form_draft', { user_id: userId, form_type: formType });
  } catch (error) {
    console.error('Error deleting form draft:', error);
  }
};

// Clear all drafts for a user (on logout)
export const clearUserDrafts = (userId: string): void => {
  for (const key of draftsCache.keys()) {
    if (key.startsWith(`${userId}_`)) {
      draftsCache.delete(key);
    }
  }
};
