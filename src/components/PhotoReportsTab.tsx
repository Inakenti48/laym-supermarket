import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { getTaskReports, updateTaskReport, type TaskReport } from '@/lib/employees';
import { CheckCircle2, XCircle, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export const PhotoReportsTab = () => {
  const [reports, setReports] = useState<TaskReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<TaskReport | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [viewPhotos, setViewPhotos] = useState<string[] | null>(null);

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = () => {
    setReports(getTaskReports());
  };

  const handleApprove = (report: TaskReport) => {
    updateTaskReport(report.id, 'approved');
    toast.success('Работа принята');
    loadReports();
    setSelectedReport(null);
  };

  const handleReject = (report: TaskReport) => {
    if (!adminNote.trim()) {
      toast.error('Введите примечание');
      return;
    }
    updateTaskReport(report.id, 'rejected', adminNote);
    toast.success('Работа отклонена с примечанием');
    setAdminNote('');
    loadReports();
    setSelectedReport(null);
  };

  const pendingReports = reports.filter(r => r.status === 'pending');
  const processedReports = reports.filter(r => r.status !== 'pending');

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4">
      <h2 className="text-lg font-semibold">Фотоотчёты</h2>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">На проверке ({pendingReports.length})</h3>
        {pendingReports.length === 0 ? (
          <Card className="p-4 text-center text-sm text-muted-foreground">
            Нет отчётов на проверке
          </Card>
        ) : (
          pendingReports.map((report) => (
            <Card key={report.id} className="p-3 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-semibold text-sm">{report.employeeName}</h4>
                  <p className="text-xs text-muted-foreground">{report.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(report.completedAt).toLocaleString('ru-RU')}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setViewPhotos(report.photos)}
                >
                  <ImageIcon className="w-4 h-4 mr-1" />
                  {report.photos.length}
                </Button>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {report.photos.slice(0, 4).map((photo, idx) => (
                  <img
                    key={idx}
                    src={photo}
                    alt={`Фото ${idx + 1}`}
                    className="w-full h-20 object-cover rounded cursor-pointer"
                    onClick={() => setViewPhotos(report.photos)}
                  />
                ))}
              </div>

              {selectedReport?.id === report.id ? (
                <div className="space-y-2 pt-2 border-t">
                  <Textarea
                    placeholder="Примечание (обязательно для отклонения)"
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    className="text-sm min-h-[60px]"
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleApprove(report)}
                      className="flex-1"
                      size="sm"
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                      Принять
                    </Button>
                    <Button
                      onClick={() => handleReject(report)}
                      variant="destructive"
                      className="flex-1"
                      size="sm"
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      Отклонить
                    </Button>
                  </div>
                  <Button
                    onClick={() => {
                      setSelectedReport(null);
                      setAdminNote('');
                    }}
                    variant="ghost"
                    size="sm"
                    className="w-full"
                  >
                    Отмена
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => setSelectedReport(report)}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  Проверить
                </Button>
              )}
            </Card>
          ))
        )}
      </div>

      {processedReports.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Обработанные</h3>
          {processedReports.map((report) => (
            <Card key={report.id} className="p-3 bg-muted/50">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {report.status === 'approved' ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-600" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{report.employeeName}</p>
                      <p className="text-xs text-muted-foreground">{report.title}</p>
                    </div>
                  </div>
                  {report.adminNote && (
                    <p className="text-xs text-muted-foreground mt-2 pl-6">
                      Примечание: {report.adminNote}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setViewPhotos(report.photos)}
                >
                  <ImageIcon className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={viewPhotos !== null} onOpenChange={() => setViewPhotos(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Фотографии</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
            {viewPhotos?.map((photo, idx) => (
              <img
                key={idx}
                src={photo}
                alt={`Фото ${idx + 1}`}
                className="w-full rounded"
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
