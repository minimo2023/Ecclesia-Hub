import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from '../../src/contexts/AuthContext.jsx';
import { CoinSystemProvider } from '../../src/contexts/CoinSystemContext.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <AuthProvider>
        <CoinSystemProvider>
          <App />
        </CoinSystemProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
