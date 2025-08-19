import React, { useState, useEffect } from 'react';
import { chooseBaseFolder, getBaseFolder, readJSONFile } from '../utils/fsAccess';
import { initFullFolderTree } from '../utils/initStructure';
import { hydrateStateFromDisk } from '../services/diskSync';

export default function StorageSetup({ setState, state }) {
  const [status, setStatus] = useState('Checking...');
  const [connected, setConnected] = useState(false);
  const [link, setLink] = useState(null);

  useEffect(() => {
    (async () => {
      const base = await getBaseFolder();
      if (base) {
        setConnected(true);
        setStatus('Connected');
        // try to read persistent link
        try {
          const files = await base.getFileHandle?.('link.json').then(() => null).catch(() => null);
        } catch (e) {}
        try {
          // use entries to find link.json handle
          for await (const [name, handle] of base.entries()) {
            if (name === 'link.json' && handle.kind === 'file') {
              const data = await readJSONFile(handle);
              if (data?.url) setLink(data.url);
              if (data?.id && !data.url) setLink(`https://hotelsurya.netlify.app/?link=${data.id}`);
              break;
            }
          }
        } catch (err) {
          // ignore
        }

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

      // read persistent link
      try {
        for await (const [name, handle] of base.entries()) {
          if (name === 'link.json' && handle.kind === 'file') {
            const data = await readJSONFile(handle);
            if (data?.url) setLink(data.url);
            if (data?.id && !data.url) setLink(`https://hotelsurya.netlify.app/?link=${data.id}`);
            break;
          }
        }
      } catch (err) {}

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
      {link && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: '#666' }}>Shared link (persistent):</div>
          <a href={link} target="_blank" rel="noreferrer">{link}</a>
        </div>
      )}
    </div>
  );
}
