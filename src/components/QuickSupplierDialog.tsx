import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { saveSupplier, Supplier } from '@/lib/suppliersDb';
import { getCurrentLoginUser } from '@/lib/loginAuth';

interface QuickSupplierDialogProps {
  open: boolean;
  onClose: () => void;
  onSupplierAdded: (supplier: Supplier) => void;
}

export const QuickSupplierDialog = ({ open, onClose, onSupplierAdded }: QuickSupplierDialogProps) => {
  const currentUser = getCurrentLoginUser();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Введите название поставщика');
      return;
    }

    try {
      const userId = currentUser?.username || 'unknown-user';
      
      const result = await saveSupplier({
        name: name.trim(),
        phone: phone.trim(),
        notes: '',
        totalDebt: 0,
      }, userId);

      if ('isOffline' in result) {
        toast.warning(`Поставщик "${name}" сохранен локально`);
      } else {
        toast.success(`Поставщик "${name}" добавлен`);
        onSupplierAdded(result);
      }
      
      setName('');
      setPhone('');
      onClose();
    } catch (error) {
      toast.error('Ошибка при добавлении поставщика');
      console.error(error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Добавить поставщика</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="supplier-name">Название поставщика *</Label>
            <Input
              id="supplier-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Введите название"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="supplier-phone">Телефон</Label>
            <Input
              id="supplier-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+7 (___) ___-__-__"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={handleSubmit}>
            Добавить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
