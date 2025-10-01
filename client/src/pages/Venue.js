import React from 'react';
import { MapPin, Users, Car, Utensils } from 'lucide-react';
import './Venue.css';

const Venue = () => {
  const features = [
    { icon: <MapPin size={24} />, title: 'Prayer Hall', description: 'Spacious prayer area with separate sections for men and women' },
    { icon: <Users size={24} />, title: 'Children\'s Area', description: 'Dedicated space for children\'s activities and supervision' },
    { icon: <Utensils size={24} />, title: 'Food Court', description: 'Traditional and international cuisine available throughout the day' },
    { icon: <Car size={24} />, title: 'Free Parking', description: 'Ample parking space available for all attendees' }
  ];

  return (
    <div className="venue-page">
      <div className="container">
        <div className="page-header">
          <h1>Venue Information</h1>
          <p>Our community center provides the perfect setting for this blessed celebration</p>
        </div>

        <div className="venue-content">
          <div className="venue-info">
            <h2>Community Center</h2>
            <p>
              Our spacious community center provides the perfect setting for this blessed celebration. 
              The venue includes separate prayer areas for men and women, children's activity zones, 
              and comfortable seating areas for families.
            </p>
            
            <div className="venue-features">
              {features.map((feature, index) => (
                <div key={index} className="feature-item">
                  <div className="feature-icon">{feature.icon}</div>
                  <div className="feature-content">
                    <h3>{feature.title}</h3>
                    <p>{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="venue-map">
            <div className="map-placeholder">
              <MapPin size={48} />
              <h3>Interactive Venue Map</h3>
              <p>Click to explore different areas of the venue</p>
              <button className="btn btn-primary">Explore Map</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Venue;
