-- Создаем таблицу для задач Wildberries аналитики
CREATE TABLE IF NOT EXISTS public.wb_analytics_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type TEXT NOT NULL CHECK (task_type IN ('search_stock', 'category_sales')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  parameters JSONB NOT NULL,
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID
);

-- Индекс для быстрого поиска по статусу
CREATE INDEX idx_wb_tasks_status ON public.wb_analytics_tasks(status);

-- Индекс для поиска по типу задачи
CREATE INDEX idx_wb_tasks_type ON public.wb_analytics_tasks(task_type);

-- Индекс для поиска по создателю
CREATE INDEX idx_wb_tasks_created_by ON public.wb_analytics_tasks(created_by);

-- Индекс для сортировки по времени
CREATE INDEX idx_wb_tasks_created_at ON public.wb_analytics_tasks(created_at DESC);

-- Триггер для обновления updated_at
CREATE TRIGGER update_wb_analytics_tasks_updated_at
  BEFORE UPDATE ON public.wb_analytics_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS политики
ALTER TABLE public.wb_analytics_tasks ENABLE ROW LEVEL SECURITY;

-- Аутентифицированные пользователи могут создавать задачи
CREATE POLICY "Authenticated users can create tasks"
  ON public.wb_analytics_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- Пользователи могут просматривать свои задачи
CREATE POLICY "Users can view their own tasks"
  ON public.wb_analytics_tasks
  FOR SELECT
  TO authenticated
  USING (auth.uid() = created_by);

-- Администраторы могут видеть все задачи
CREATE POLICY "Admins can view all tasks"
  ON public.wb_analytics_tasks
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Система может обновлять задачи (для Edge Function)
CREATE POLICY "System can update tasks"
  ON public.wb_analytics_tasks
  FOR UPDATE
  TO authenticated
  USING (true);