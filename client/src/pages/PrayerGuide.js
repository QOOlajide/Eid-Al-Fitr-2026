import React from 'react';
import { BookOpen, Clock, Users, Heart } from 'lucide-react';
import './PrayerGuide.css';

const PrayerGuide = () => {
  const steps = [
    {
      number: 1,
      title: 'Intention (Niyyah)',
      description: 'Make the intention to perform the Eid prayer for the sake of Allah'
    },
    {
      number: 2,
      title: 'First Rak\'ah',
      description: 'Begin with 7 additional takbirs, then recite Al-Fatiha and another surah'
    },
    {
      number: 3,
      title: 'Second Rak\'ah',
      description: 'Stand up and perform 5 additional takbirs, then complete the prayer'
    },
    {
      number: 4,
      title: 'Khutbah',
      description: 'Listen to the khutbah (sermon) delivered by the Imam'
    }
  ];

  const notes = [
    'Eid prayer is performed in congregation',
    'It\'s recommended to eat something sweet before the prayer',
    'Wear your best clothes for the occasion',
    'Give Zakat al-Fitr before the prayer'
  ];

  return (
    <div className="prayer-guide-page">
      <div className="container">
        <div className="page-header">
          <h1>Eid Prayer Guide</h1>
          <p>Learn about the Eid prayer with step-by-step instructions and spiritual significance</p>
        </div>

        <div className="prayer-content">
          <div className="prayer-intro">
            <h2>Understanding the Eid Prayer</h2>
            <p>
              The Eid prayer is a special congregational prayer performed on the morning of Eid al-Fitr. 
              It consists of two rak'ahs with additional takbirs.
            </p>
          </div>

          <div className="prayer-steps">
            <h2>Prayer Steps</h2>
            <div className="steps-grid">
              {steps.map((step, index) => (
                <div key={index} className="step-item">
                  <div className="step-number">{step.number}</div>
                  <div className="step-content">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="prayer-notes">
            <h2>Important Notes</h2>
            <ul>
              {notes.map((note, index) => (
                <li key={index}>{note}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrayerGuide;
