import React from 'react';
// Import the SubscriptionForm component
import { SubscriptionForm } from './SubscriptionForm';

export default function App() {
  return (
    <div style={{ 
      maxWidth: '800px', // Adjust max width for better layout
      margin: '50px auto', 
      fontFamily: 'Inter, Arial, sans-serif', // Use Inter font
      padding: '20px',
      boxSizing: 'border-box' // Ensure padding doesn't add to total width
    }}>
      {/* The SubscriptionForm component now handles all subscription logic and UI */}
      <SubscriptionForm />
    </div>
  );
}
