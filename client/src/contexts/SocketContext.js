import React, { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';

const SocketContext = createContext();

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Production must set REACT_APP_SERVER_URL. Do not fall back to localhost
    // on a deployed site — that spams ERR_CONNECTION_REFUSED and is unrelated to RAG.
    const serverUrl =
      process.env.REACT_APP_SERVER_URL ||
      (process.env.NODE_ENV !== 'production' ? 'http://localhost:5000' : null);

    if (!serverUrl) {
      return undefined;
    }

    const newSocket = io(serverUrl, { autoConnect: true, reconnection: false });

    newSocket.on('connect', () => {
      setConnected(true);
    });

    newSocket.on('disconnect', () => {
      setConnected(false);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  const value = {
    socket,
    connected,
    emit: (event, data) => {
      if (socket) {
        socket.emit(event, data);
      }
    },
    on: (event, callback) => {
      if (socket) {
        socket.on(event, callback);
      }
    },
    off: (event, callback) => {
      if (socket) {
        socket.off(event, callback);
      }
    }
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};
