import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import FootageStudio from './FootageStudio';
import { AuthGate } from './AuthGate';
import './styles.css';

const App = lazy(() => import('./App'));
const RenderPage = lazy(() => import('./RenderPage').then(module => ({ default: module.RenderPage })));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><Suspense fallback={<p role="status">Abrindo o ateliê…</p>}>{window.location.pathname === '/render' ? <RenderPage /> : <AuthGate>{window.location.pathname === '/prototype' ? <App /> : <FootageStudio />}</AuthGate>}</Suspense></React.StrictMode>,
);
