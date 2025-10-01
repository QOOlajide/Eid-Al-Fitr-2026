import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import App from '../App';

// Mock the contexts
jest.mock('../contexts/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => ({
    user: null,
    loading: false,
    isAuthenticated: false
  })
}));

jest.mock('../contexts/SocketContext', () => ({
  SocketProvider: ({ children }) => children,
  useSocket: () => ({
    socket: null,
    connected: false
  })
}));

jest.mock('../contexts/RAGContext', () => ({
  RAGProvider: ({ children }) => children,
  useRAG: () => ({
    loading: false,
    searchHistory: []
  })
}));

// Mock Stripe Elements
jest.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }) => children,
  loadStripe: () => Promise.resolve(null)
}));

const AppWithRouter = () => (
  <BrowserRouter>
    <App />
  </BrowserRouter>
);

describe('App Component', () => {
  test('renders navigation', () => {
    render(<AppWithRouter />);
    expect(screen.getByText('Eid al-Fitr 2025')).toBeInTheDocument();
  });

  test('renders home page by default', () => {
    render(<AppWithRouter />);
    expect(screen.getByText('Eid Mubarak!')).toBeInTheDocument();
  });

  test('renders navigation links', () => {
    render(<AppWithRouter />);
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Venue')).toBeInTheDocument();
    expect(screen.getByText('Schedule')).toBeInTheDocument();
    expect(screen.getByText('Prayer Guide')).toBeInTheDocument();
    expect(screen.getByText('Zakat al-Fitr')).toBeInTheDocument();
    expect(screen.getByText('Community')).toBeInTheDocument();
    expect(screen.getByText('Islamic Q&A')).toBeInTheDocument();
  });
});
