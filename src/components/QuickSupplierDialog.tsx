import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { saveSupplier, Supplier } from '@/lib/storage';
import { getCurrentUser } from '@/lib/auth';

interface QuickSupplierDialogProps {
  open: boolean;
  onClose: () => void;
  onSupplierAdded: (supplier: Supplier) => void;
}

export const QuickSupplierDialog = ({ open, onClose, onSupplierAdded }: QuickSupplierDialogProps) => {
  const currentUser = getCurrentUser();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Введите название поставщика');
      return;
    }

    try {
      const newSupplier = await saveSupplier({
        name: name.trim(),
        phone: phone.trim(),
        notes: '',
        totalDebt: 0,
      }, currentUser?.username || 'unknown');

      toast.success(`Поставщик "${name}" добавлен`);
      onSupplierAdded(newSupplier);
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
