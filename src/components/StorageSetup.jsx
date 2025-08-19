import React, { useState, useEffect } from 'react';
import { chooseBaseFolder, getBaseFolder } from '../utils/fsAccess';
import { initFullFolderTree } from '../utils/initStructure';
import { hydrateStateFromDisk, upsertDiskDoc } from '../services/diskSync';
import { initGun, subscribeCollection, putDoc, offCollection } from '../services/realtime';

export default function StorageSetup({ setState, state }) {
  const [status, setStatus] = useState('Checking...');
  const [connected, setConnected] = useState(false);
  const [p2pEnabled, setP2pEnabled] = useState(false);
  const [peers, setPeers] = useState('https://gun-manhattan.herokuapp.com/gun'); // default public peer for testing

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

  useEffect(() => {
    if (!p2pEnabled) return;
    // initialize gun with peers
    const peerList = peers.split(',').map(p => p.trim()).filter(Boolean);
    initGun({ peers: peerList });

    // subscribe to relevant collections
    const applyRemote = async (collection, key, data) => {
      try {
        // merge into local state depending on collection
        if (collection === 'checkins') {
          // write to disk and optionally merge into in-memory state by rehydrating
          await upsertDiskDoc('Checkins', { ...data, id: key });
        } else if (collection === 'reservations') {
          await upsertDiskDoc('Reservations', { ...data, id: key });
        } else {
          // generic
          await upsertDiskDoc(collection, { ...data, id: key });
        }

        // re-hydrate from disk to get canonical state and set it
        const newState = await hydrateStateFromDisk(state);
        if (newState) setState(newState);
      } catch (err) {
        console.warn('applyRemote error', err);
      }
    };

    // wrapper for subscribeCollection to capture name
    const subCheckin = (key, data) => applyRemote('checkins', key, data);
    const subRes = (key, data) => applyRemote('reservations', key, data);

    subscribeCollection('checkins', (key, data) => subCheckin(key, data));
    subscribeCollection('reservations', (key, data) => subRes(key, data));

    return () => {
      try { offCollection('checkins'); offCollection('reservations'); } catch (e) {}
    };
  }, [p2pEnabled, peers]);

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

  const toggleP2P = () => {
    setP2pEnabled(v => !v);
    setStatus(p2pEnabled ? 'P2P disabled' : 'P2P enabled');
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Storage Setup</h2>
      <p>Choose your base folder. If files exist, data will be loaded from disk.</p>
      <button className="btn primary" onClick={connect}>
        {connected ? 'Re-select Folder' : 'Choose Folder'}
      </button>
      <div style={{ height: 12 }} />
      <h3>P2P Sync (free)</h3>
      <p style={{ marginTop: 0, marginBottom: 6 }}>Enable peer-to-peer realtime sync using GunDB. Peers are comma-separated URLs.</p>
      <input className="input" value={peers} onChange={(e) => setPeers(e.target.value)} placeholder="peer1,peer2" />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn" onClick={toggleP2P}>{p2pEnabled ? 'Disable Sync' : 'Enable Sync'}</button>
        <div style={{ alignSelf: 'center', color: 'var(--muted)' }}>{p2pEnabled ? 'Sync active' : 'Sync inactive'}</div>
      </div>
      <p>{status}</p>
    </div>
  );
}
