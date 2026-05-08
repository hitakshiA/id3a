import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import App from './App.jsx';
import Landing from './pages/Landing.jsx';
import AuthVerify from './pages/AuthVerify.jsx';
import Dashboard from './pages/Dashboard.jsx';
import NewProject from './pages/NewProject.jsx';
import NotFound from './pages/NotFound.jsx';
import './styles.css';

if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => console.error('[window error]', e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => console.error('[unhandled promise]', e.reason));
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
    <BrowserRouter>
      <Routes>
        <Route element={<App />}>
          <Route path="/" element={<Landing />} />
          <Route path="/auth/verify" element={<AuthVerify />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/signup" element={<Navigate to="/" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/new" element={<NewProject />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
