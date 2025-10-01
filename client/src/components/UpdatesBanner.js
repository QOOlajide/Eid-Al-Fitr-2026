import React, { useState, useEffect } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { Bell } from 'lucide-react';
import './UpdatesBanner.css';

const UpdatesBanner = () => {
  const [currentUpdate, setCurrentUpdate] = useState(0);
  const { socket, on } = useSocket();

  const defaultUpdates = [
    "Welcome to Eid al-Fitr 2025! Prayer begins at 8:00 AM",
    "Imam has arrived! Prayer will start in 15 minutes",
    "Community breakfast is now being served in the food court",
    "Children's activities are starting in the children's area",
    "Islamic lecture begins at 11:00 AM in the conference room",
    "Lunch service is now available in the food court",
    "Community social gathering starts at 2:00 PM"
  ];

  const [updates, setUpdates] = useState(defaultUpdates);

  useEffect(() => {
    // Listen for real-time updates from server
    on('update', (data) => {
      setUpdates(prev => [data.message, ...prev]);
      setCurrentUpdate(0); // Show the new update immediately
    });

    // Rotate through updates every 10 seconds
    const interval = setInterval(() => {
      setCurrentUpdate(prev => (prev + 1) % updates.length);
    }, 10000);

    return () => clearInterval(interval);
  }, [on, updates.length]);

  return (
    <div className="updates-banner">
      <div className="updates-content">
        <Bell size={20} />
        <span className="update-text">{updates[currentUpdate]}</span>
        <div className="update-indicators">
          {updates.map((_, index) => (
            <div
              key={index}
              className={`indicator ${index === currentUpdate ? 'active' : ''}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default UpdatesBanner;
