// src/Loader.jsx
import React from 'react';

export function Loader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#3498db' }}>
      <div style={{
        border: '4px solid rgba(0, 0, 0, 0.1)', // Light grey border with transparency
        borderLeftColor: '#3498db', // Blue top border to create spinning effect
        borderRadius: '50%',
        width: '20px',
        height: '20px',
        animation: 'spin 1s linear infinite', // CSS animation for spinning
      }}></div>
      Loading... {/* Added "Loading..." text */}
      {/* Basic inline style for the keyframe animation */}
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}
