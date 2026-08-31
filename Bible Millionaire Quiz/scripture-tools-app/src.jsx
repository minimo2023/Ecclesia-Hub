import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppRouter } from './src/AppRouter.jsx';
import './src/styles.css';

createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <AppRouter />
    </React.StrictMode>
);
