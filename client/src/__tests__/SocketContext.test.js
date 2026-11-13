import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { SocketProvider } from '../contexts/SocketContext';

const mockIo = jest.fn(() => ({
  on: jest.fn(),
  close: jest.fn(),
}));

jest.mock('socket.io-client', () => ({
  __esModule: true,
  default: (...args) => mockIo(...args),
}));

describe('SocketProvider', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    mockIo.mockClear();
    process.env.NODE_ENV = originalEnv;
  });

  test('does not call io() in production (avoids /socket.io 404 on Vercel)', async () => {
    process.env.NODE_ENV = 'production';

    render(
      <SocketProvider>
        <div>child</div>
      </SocketProvider>
    );

    await waitFor(() => {
      expect(mockIo).toHaveBeenCalledTimes(0);
    });
  });
});
