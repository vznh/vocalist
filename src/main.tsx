import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import CornerDials from './CornerDials';
import './style.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode>
  <App />
  <CornerDials />
</React.StrictMode>);
