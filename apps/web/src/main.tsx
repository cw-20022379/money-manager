/**
 * main.tsx — 앱 진입점
 *
 * React 18 루트를 마운트한다. StrictMode를 유지해 개발 중 부작용 이중 실행을 감지한다.
 * App 컴포넌트가 preview/일반 두 가지 라우팅을 모두 담당하므로 여기선 단순 마운트만.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
