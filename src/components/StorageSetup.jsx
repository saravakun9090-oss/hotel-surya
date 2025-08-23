import React, { useState, useEffect } from 'react';
import { chooseBaseFolder, getBaseFolder } from '../utils/fsAccess';
import { initFullFolderTree } from '../utils/initStructure';
import { load, save, ping } from '../services/storageAdapter';

export default function StorageSetup({ setState, state }) {
  const [status, setStatus] = useState('Idle');
  const [connecting, setConnecting] = useState(false);

  // Single connect flow: select base folder, init folders, hydrate local, then try Mongo and merge
  const connectAll = async () => {
    setConnecting(true);
    setStatus('Selecting base folder...');
    try {
      const base = await chooseBaseFolder();
      await initFullFolderTree(base);
      setStatus('Loading from local disk...');
      const localState = await load('local', state).catch(() => null);
      if (localState) setState(localState);

      setStatus('Connecting to Mongo...');
      const ok = await ping('mongo');
      if (ok) {
        setStatus('Loading from Mongo and merging...');
        try {
          const mongoState = await load('mongo', localState || state).catch(() => null);
          // Merge simple: prefer Mongo guests/reservations but preserve local rates/floors where present
          if (mongoState) {
            const merged = { ...mongoState };
            // preserve local floor rates if available
            if (localState?.floors) {
              for (const fnum of Object.keys(merged.floors || {})) {
                merged.floors[fnum] = merged.floors[fnum].map(r => {
                  const old = localState.floors[fnum]?.find(x => x.number === r.number);
                  return old ? { ...r, rate: old.rate ?? r.rate } : r;
                });
              }
            }
            setState(merged);
          }
          setStatus('Connected to Mongo and local storage');
          } catch (_e) {
          console.warn('Mongo load failed', _e);
          setStatus('Local loaded; Mongo connection failed');
        }
      } else {
        setStatus('Local loaded; Mongo not available');
      }
    } catch (_err) {
      console.error(_err);
      setStatus(`Error: ${_err.message}`);
    } finally {
      setConnecting(false);
    }
  };

  // Auto-connect on mount if base folder already stored or previously connected
  useEffect(() => {
    (async () => {
      try {
        setStatus('Checking storage...');
        const base = await getBaseFolder();
        const prev = localStorage.getItem('storage_connected');
        if (base || prev) {
          setStatus('Found previous storage. Loading...');
          // hydrate from disk without prompting
          const localState = await load('local', state).catch(() => null);
          if (localState) setState(localState);

          // attempt mongo
          setStatus('Checking Mongo connection...');
          const ok = await ping('mongo');
          if (ok) {
            try {
              const mongoState = await load('mongo', localState || state).catch(() => null);
              if (mongoState) {
                const merged = { ...mongoState };
                if (localState?.floors) {
                  for (const fnum of Object.keys(merged.floors || {})) {
                    merged.floors[fnum] = merged.floors[fnum].map(r => {
                      const old = localState.floors[fnum]?.find(x => x.number === r.number);
                      return old ? { ...r, rate: old.rate ?? r.rate } : r;
                    });
                  }
                }
                setState(merged);
              }
              setStatus('Connected to Mongo and local storage');
              localStorage.setItem('storage_connected', '1');
            } catch (_e) {
              console.warn('Mongo auto-load failed', _e);
              setStatus('Local loaded; Mongo connection failed');
            }
          } else {
            setStatus('Local loaded; Mongo not available');
          }
        } else {
          setStatus('Not connected');
        }
      } catch (_e) {
        console.warn('Auto-connect failed', _e);
        setStatus('Idle');
      }
    })();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h2>Storage Setup</h2>
      <p>Connect local storage and MongoDB with one button. The app will save locally and upload to Mongo automatically.</p>
      <button className="btn primary" onClick={connectAll} disabled={connecting}>
        {connecting ? 'Connecting...' : 'Connect Storage'}
      </button>
      <p style={{ marginTop: 12 }}>{status}</p>
    </div>
  );
}
