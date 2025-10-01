import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Heart, DollarSign, Users, Info } from 'lucide-react';
import './ZakatPayment.css';

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

const PaymentForm = ({ amount, donorName, familySize, onSuccess }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    if (!stripe || !elements) {
      setError('Stripe not loaded');
      setLoading(false);
      return;
    }

    try {
      // Create payment intent
      const response = await fetch('/api/payment/create-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount,
          donorName,
          familySize,
          paymentType: 'zakat_al_fitr'
        }),
      });

      const { clientSecret } = await response.json();

      // Confirm payment
      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: elements.getElement(CardElement),
        }
      });

      if (stripeError) {
        setError(stripeError.message);
      } else if (paymentIntent.status === 'succeeded') {
        onSuccess(paymentIntent);
      }
    } catch (err) {
      setError('Payment failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="payment-form">
      <div className="form-group">
        <label>Card Details</label>
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#424770',
                '::placeholder': {
                  color: '#aab7c4',
                },
              },
            },
          }}
        />
      </div>
      
      {error && <div className="error-message">{error}</div>}
      
      <button 
        type="submit" 
        disabled={!stripe || loading}
        className="btn btn-primary payment-btn"
      >
        {loading ? 'Processing...' : `Pay $${amount.toFixed(2)}`}
      </button>
    </form>
  );
};

const ZakatPayment = () => {
  const [donorName, setDonorName] = useState('');
  const [familySize, setFamilySize] = useState(1);
  const [amountPerPerson, setAmountPerPerson] = useState(10);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  const totalAmount = familySize * amountPerPerson;

  const handlePaymentSuccess = (paymentIntent) => {
    setPaymentSuccess(true);
    // You could redirect or show a success message
  };

  if (paymentSuccess) {
    return (
      <div className="zakat-payment-page">
        <div className="container">
          <div className="payment-success">
            <Heart size={64} className="success-icon" />
            <h1>Payment Successful!</h1>
            <p>Thank you for your Zakat al-Fitr payment.</p>
            <p>May Allah accept your charity and bless you abundantly.</p>
            <button 
              onClick={() => setPaymentSuccess(false)}
              className="btn btn-primary"
            >
              Make Another Payment
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="zakat-payment-page">
      <div className="container">
        <div className="page-header">
          <h1>Zakat al-Fitr</h1>
          <p>Make your Zakat al-Fitr payment online securely</p>
        </div>

        <div className="zakat-content">
          <div className="zakat-info">
            <h2>What is Zakat al-Fitr?</h2>
            <p>
              Zakat al-Fitr is a charitable donation given before the Eid prayer. 
              It purifies those who fast from any indecent act or speech and helps the poor and needy.
            </p>
            
            <div className="zakat-details">
              <div className="detail-item">
                <DollarSign size={24} />
                <div>
                  <h3>Amount</h3>
                  <p>$10 per person (recommended amount)</p>
                </div>
              </div>
              <div className="detail-item">
                <Users size={24} />
                <div>
                  <h3>Recipients</h3>
                  <p>Poor and needy in the community</p>
                </div>
              </div>
              <div className="detail-item">
                <Info size={24} />
                <div>
                  <h3>Timing</h3>
                  <p>Must be given before the Eid prayer</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="payment-section">
            <h2>Make Your Payment</h2>
            
            <div className="payment-form-container">
              <div className="form-group">
                <label htmlFor="donorName">Your Name</label>
                <input
                  type="text"
                  id="donorName"
                  value={donorName}
                  onChange={(e) => setDonorName(e.target.value)}
                  required
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="familySize">Family Size</label>
                <input
                  type="number"
                  id="familySize"
                  value={familySize}
                  onChange={(e) => setFamilySize(parseInt(e.target.value) || 1)}
                  min="1"
                  max="50"
                  required
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="amountPerPerson">Amount per Person</label>
                <input
                  type="number"
                  id="amountPerPerson"
                  value={amountPerPerson}
                  onChange={(e) => setAmountPerPerson(parseFloat(e.target.value) || 10)}
                  min="5"
                  step="0.01"
                  required
                />
              </div>
              
              <div className="total-amount">
                <strong>Total: ${totalAmount.toFixed(2)}</strong>
              </div>
              
              {donorName && (
                <Elements stripe={stripePromise}>
                  <PaymentForm
                    amount={totalAmount}
                    donorName={donorName}
                    familySize={familySize}
                    onSuccess={handlePaymentSuccess}
                  />
                </Elements>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ZakatPayment;
