import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { SocketProvider } from './contexts/SocketContext';
import { AuthProvider } from './contexts/AuthContext';
import { RAGProvider } from './contexts/RAGContext';

// Components
import Navbar from './components/Navbar';
import UpdatesBanner from './components/UpdatesBanner';
import Home from './pages/Home';
import Venue from './pages/Venue';
import Schedule from './pages/Schedule';
import PrayerGuide from './pages/PrayerGuide';
import ZakatPayment from './pages/ZakatPayment';
import Forum from './pages/Forum';
import IslamicQA from './pages/IslamicQA';
import Footer from './components/Footer';

// Initialize Stripe
const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

function App() {
  return (
    <Router>
      <AuthProvider>
        <SocketProvider>
          <RAGProvider>
            <Elements stripe={stripePromise}>
              <div className="App">
                <Navbar />
                <UpdatesBanner />
                <main>
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/venue" element={<Venue />} />
                    <Route path="/schedule" element={<Schedule />} />
                    <Route path="/prayer-guide" element={<PrayerGuide />} />
                    <Route path="/zakat" element={<ZakatPayment />} />
                    <Route path="/forum" element={<Forum />} />
                    <Route path="/islamic-qa" element={<IslamicQA />} />
                  </Routes>
                </main>
                <Footer />
              </div>
            </Elements>
          </RAGProvider>
        </SocketProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
