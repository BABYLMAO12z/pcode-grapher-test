import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import './styles/app.css';
import App from './App.jsx';

createRoot(document.getElementById('app')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
