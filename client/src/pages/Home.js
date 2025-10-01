import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, Users, BookOpen, Heart } from 'lucide-react';
import './Home.css';

const Home = () => {
  const features = [
    {
      icon: <Calendar size={48} />,
      title: 'Event Schedule',
      description: 'View the complete schedule of Eid activities for adults and children',
      link: '/schedule'
    },
    {
      icon: <BookOpen size={48} />,
      title: 'Prayer Guide',
      description: 'Learn about Eid prayer with step-by-step instructions',
      link: '/prayer-guide'
    },
    {
      icon: <Heart size={48} />,
      title: 'Zakat al-Fitr',
      description: 'Make your Zakat al-Fitr payment online securely',
      link: '/zakat'
    },
    {
      icon: <Users size={48} />,
      title: 'Community Forum',
      description: 'Ask questions and connect with the community',
      link: '/forum'
    }
  ];

  return (
    <div className="home">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="container">
          <motion.div 
            className="hero-content"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="hero-title">Eid Mubarak!</h1>
            <p className="hero-subtitle">Join us for a blessed celebration of Eid al-Fitr 2025</p>
            <p className="hero-description">
              A day of joy, gratitude, and community. Whether you're a Muslim attendee or a curious visitor, 
              we welcome you to experience the beauty of this sacred celebration.
            </p>
            <div className="hero-buttons">
              <Link to="/prayer-guide" className="btn btn-primary">
                Prayer Guide
              </Link>
              <Link to="/venue" className="btn btn-outline">
                Explore Venue
              </Link>
            </div>
          </motion.div>
          
          <motion.div 
            className="hero-image"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="hero-placeholder">
              <div className="mosque-icon">🕌</div>
              <p>Eid Celebration</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
          >
            <h2 className="section-title">What to Expect</h2>
            <div className="features-grid">
              {features.map((feature, index) => (
                <motion.div
                  key={index}
                  className="feature-card"
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  viewport={{ once: true }}
                  whileHover={{ y: -5 }}
                >
                  <div className="feature-icon">{feature.icon}</div>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                  <Link to={feature.link} className="feature-link">
                    Learn More →
                  </Link>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Islamic Q&A Section */}
      <section className="qa-preview-section">
        <div className="container">
          <motion.div
            className="qa-preview-content"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
          >
            <h2>Have Questions About Islam?</h2>
            <p>
              Our AI-powered Q&A system searches through trusted Islamic sources to provide 
              accurate answers to your questions about Islamic teachings, practices, and beliefs.
            </p>
            <Link to="/islamic-qa" className="btn btn-primary">
              Ask a Question
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Event Highlights */}
      <section className="highlights-section">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
          >
            <h2 className="section-title">Event Highlights</h2>
            <div className="highlights-grid">
              <div className="highlight-item">
                <div className="highlight-time">8:00 AM</div>
                <div className="highlight-content">
                  <h3>Eid Prayer</h3>
                  <p>Community prayer led by Imam</p>
                </div>
              </div>
              <div className="highlight-item">
                <div className="highlight-time">9:00 AM</div>
                <div className="highlight-content">
                  <h3>Community Breakfast</h3>
                  <p>Traditional Eid breakfast</p>
                </div>
              </div>
              <div className="highlight-item">
                <div className="highlight-time">10:00 AM</div>
                <div className="highlight-content">
                  <h3>Children's Activities</h3>
                  <p>Games and educational activities</p>
                </div>
              </div>
              <div className="highlight-item">
                <div className="highlight-time">11:00 AM</div>
                <div className="highlight-content">
                  <h3>Islamic Lecture</h3>
                  <p>Understanding Eid al-Fitr significance</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default Home;
