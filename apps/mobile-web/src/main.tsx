import '@diet/ui/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startStorage } from './db/runtime';
import { isFramed, refuseToRunFramed } from './framing';
import { listenForInstallPrompt } from './pwa/install';
import { startServiceWorker } from './pwa/registerServiceWorker';
import { askAgainWhenItMayHelp, requestPersistentStorage } from './pwa/storage';

const container = document.getElementById('root');
if (container === null) throw new Error('index.html has no #root element');

if (isFramed()) {
  refuseToRunFramed(container);
} else {
  // Before the first render, so an early install prompt event is not missed.
  listenForInstallPrompt();
  startServiceWorker();
  void requestPersistentStorage();
  askAgainWhenItMayHelp();
  void startStorage();
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
