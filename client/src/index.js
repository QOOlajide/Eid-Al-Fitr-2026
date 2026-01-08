import React from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import './index.css';
import App from './App';

// Make API base configurable so the backend can run on non-5000 ports (e.g. 5001).
// If not set, CRA's proxy (client/package.json) still works.
if (process.env.REACT_APP_SERVER_URL) {
  axios.defaults.baseURL = process.env.REACT_APP_SERVER_URL;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
