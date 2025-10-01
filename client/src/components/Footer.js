import React from 'react';
import { Link } from 'react-router-dom';
import { Heart, Mail, Phone, MapPin } from 'lucide-react';
import './Footer.css';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-content">
          <div className="footer-section">
            <h3>Eid al-Fitr 2025</h3>
            <p>Celebrating the blessed day of Eid with our community</p>
            <div className="footer-heart">
              <Heart size={20} />
              <span>Made with love for the community</span>
            </div>
          </div>
          
          <div className="footer-section">
            <h4>Quick Links</h4>
            <ul>
              <li><Link to="/prayer-guide">Prayer Guide</Link></li>
              <li><Link to="/zakat">Zakat al-Fitr</Link></li>
              <li><Link to="/schedule">Event Schedule</Link></li>
              <li><Link to="/forum">Community Forum</Link></li>
              <li><Link to="/islamic-qa">Islamic Q&A</Link></li>
            </ul>
          </div>
          
          <div className="footer-section">
            <h4>Event Information</h4>
            <ul>
              <li><Link to="/venue">Venue Details</Link></li>
              <li><Link to="/schedule">Activities</Link></li>
              <li><Link to="/prayer-guide">Prayer Times</Link></li>
              <li><Link to="/forum">Get Help</Link></li>
            </ul>
          </div>
          
          <div className="footer-section">
            <h4>Contact</h4>
            <div className="contact-info">
              <div className="contact-item">
                <MapPin size={16} />
                <span>Community Center<br />123 Islamic Way<br />City, State 12345</span>
              </div>
              <div className="contact-item">
                <Phone size={16} />
                <span>(555) 123-4567</span>
              </div>
              <div className="contact-item">
                <Mail size={16} />
                <span>info@eid2025.com</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="footer-bottom">
          <p>&copy; {currentYear} Eid al-Fitr Community Celebration. All rights reserved.</p>
          <p className="footer-disclaimer">
            This website is for educational and community purposes. 
            For religious guidance, please consult with qualified Islamic scholars.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
