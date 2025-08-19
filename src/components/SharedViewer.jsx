import React from 'react';

export default function SharedViewer() {
  return (
    <div style={{ padding: 20 }}>
      <h2>Shared Viewer</h2>
      <p>This is a lightweight placeholder for the public/mobile viewer.</p>
      <p>Open the public link on the hosted site: https://hotelsurya.netlify.app/&lt;id&gt;</p>
      <p>If you want live updates from a connected storage, the app creates a persistent link.json and writes Shared/sharedSnapshot.json when the app state changes.</p>
    </div>
  );
}
