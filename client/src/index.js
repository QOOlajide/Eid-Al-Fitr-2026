import React from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import './index.css';
import App from './App';

// Make API base configurable so the backend can run on non-5000 ports (e.g. 5001).
// If not set, CRA's proxy (client/package.json) still works locally — on Vercel
// this MUST be set or /api/* hits the static frontend (often 405 on POST).
// Strip trailing slash so paths don't become https://api.example.com//api/...
const serverUrl = (process.env.REACT_APP_SERVER_URL || '').replace(/\/$/, '');
if (serverUrl) {
  axios.defaults.baseURL = serverUrl;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
