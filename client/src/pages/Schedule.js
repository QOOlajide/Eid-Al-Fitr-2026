import React, { useState } from 'react';
import { Clock, MapPin, Users } from 'lucide-react';
import './Schedule.css';

const Schedule = () => {
  const [filter, setFilter] = useState('all');
  
  const events = [
    { time: '8:00 AM', title: 'Eid Prayer', description: 'Community Eid prayer led by Imam', location: 'Main Prayer Hall', category: 'adults' },
    { time: '9:00 AM', title: 'Community Breakfast', description: 'Traditional Eid breakfast with family and friends', location: 'Food Court', category: 'all' },
    { time: '10:00 AM', title: 'Children\'s Activities', description: 'Games, crafts, and educational activities for kids', location: 'Children\'s Area', category: 'children' },
    { time: '11:00 AM', title: 'Islamic Lecture', description: 'Understanding the significance of Eid al-Fitr', location: 'Conference Room', category: 'adults' },
    { time: '12:00 PM', title: 'Lunch Service', description: 'Traditional and international cuisine available', location: 'Food Court', category: 'food' },
    { time: '2:00 PM', title: 'Community Social', description: 'Meet and greet with community members', location: 'Main Hall', category: 'all' }
  ];

  const filteredEvents = filter === 'all' ? events : events.filter(event => event.category === filter);

  return (
    <div className="schedule-page">
      <div className="container">
        <div className="page-header">
          <h1>Event Schedule</h1>
          <p>Join us for a day full of activities, prayer, and community celebration</p>
        </div>

        <div className="schedule-filters">
          <button className={`filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
            All Activities
          </button>
          <button className={`filter-btn ${filter === 'adults' ? 'active' : ''}`} onClick={() => setFilter('adults')}>
            Adults
          </button>
          <button className={`filter-btn ${filter === 'children' ? 'active' : ''}`} onClick={() => setFilter('children')}>
            Children
          </button>
          <button className={`filter-btn ${filter === 'food' ? 'active' : ''}`} onClick={() => setFilter('food')}>
            Food & Dining
          </button>
        </div>

        <div className="schedule-grid">
          {filteredEvents.map((event, index) => (
            <div key={index} className="schedule-item">
              <div className="schedule-time">
                <Clock size={20} />
                {event.time}
              </div>
              <div className="schedule-content">
                <h3>{event.title}</h3>
                <p>{event.description}</p>
                <div className="schedule-meta">
                  <span className="location">
                    <MapPin size={16} />
                    {event.location}
                  </span>
                  <span className="category">
                    <Users size={16} />
                    {event.category}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Schedule;
