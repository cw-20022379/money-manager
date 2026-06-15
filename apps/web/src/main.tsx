import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import { initSenior } from './lib/senior.js';
import './index.css';

initSenior();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
