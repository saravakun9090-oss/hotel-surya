import React, { useState, useEffect } from 'react';
import { chooseBaseFolder, getBaseFolder } from '../utils/fsAccess';
import { initFullFolderTree } from '../utils/initStructure';
import { hydrateStateFromDisk } from '../services/diskSync';

export default function StorageSetup({ setState, state }) {
  const [status, setStatus] = useState('Checking...');
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    (async () => {
      const base = await getBaseFolder();
      if (base) {
        setConnected(true);
        setStatus('Connected');
        const synced = await hydrateStateFromDisk(state);
        if (synced) setState(synced);
      } else {
        setConnected(false);
        setStatus('Not connected');
      }
    })();
  }, []);

  const connect = async () => {
    try {
      const base = await chooseBaseFolder();
      await initFullFolderTree(base);
      setConnected(true);
      setStatus('Connected & folders created');

      const synced = await hydrateStateFromDisk(state);
      if (synced) setState(synced);
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message}`);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Storage Setup</h2>
      <p>Choose your base folder. If files exist, data will be loaded from disk.</p>
      <button className="btn primary" onClick={connect}>
        {connected ? 'Re-select Folder' : 'Choose Folder'}
      </button>
      <p>{status}</p>
    </div>
  );
}
