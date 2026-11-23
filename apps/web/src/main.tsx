import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import App from './App';
import './styles/global.css';
import './styles/branding.css';
import './styles/modules.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><AuthProvider><App /></AuthProvider></ErrorBoundary></React.StrictMode>);
