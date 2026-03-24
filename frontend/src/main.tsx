import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { TooltipProvider } from '@/components/ui/tooltip';
import App from './App.tsx';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </StrictMode>,
);
