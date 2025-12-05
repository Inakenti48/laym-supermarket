import { Database } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function DatabaseModeSwitch() {
  return (
    <Badge variant="outline" className="gap-2">
      <Database className="h-3 w-3" />
      MySQL
    </Badge>
  );
}
