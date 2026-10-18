import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthGate } from './AuthGate';
import { RenderPage } from './RenderPage';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{window.location.pathname === '/render' ? <RenderPage /> : <AuthGate><App /></AuthGate>}</React.StrictMode>,
);
