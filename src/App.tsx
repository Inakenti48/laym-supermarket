import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect } from "react";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { startAutoSync } from "@/lib/syncService";
import { initLocalDB } from "@/lib/localDatabase";

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    // Инициализируем локальную базу данных
    initLocalDB().then(() => {
      console.log('✅ Локальная база данных готова');
      // Запускаем автоматическую синхронизацию каждые 30 минут
      startAutoSync();
      console.log('🔄 Автосинхронизация запущена (каждые 30 минут)');
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
