import '@diet/ui/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { listenForInstallPrompt } from './pwa/install';
import { startServiceWorker } from './pwa/registerServiceWorker';
import { requestPersistentStorage } from './pwa/storage';

// Before the first render, so an early install prompt event is not missed.
listenForInstallPrompt();
startServiceWorker();
void requestPersistentStorage();

const container = document.getElementById('root');
if (container === null) throw new Error('index.html has no #root element');
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
