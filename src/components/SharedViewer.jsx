import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

export default function SharedViewer() {
  const { id } = useParams();
  const [snapshot, setSnapshot] = useState(null);
  const [status, setStatus] = useState('idle');

  // Try to fetch the snapshot from a few likely locations.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!id) return setStatus('No id provided');
      setStatus('Fetching snapshot...');
      // 1) Try hosted server path (if you have setup server mapping)
      const candidates = [
        `/shared/${id}/sharedSnapshot.json`, // if server maps folders
        `/sharedSnapshot.json?link=${id}`,
        `/Shared/sharedSnapshot.json` // local path fallback (only works if snapshot is hosted)
      ];

      for (const url of candidates) {
        try {
          const res = await fetch(url, { cache: 'no-cache' });
          if (!res.ok) continue;
          const data = await res.json();
          if (!alive) return;
          setSnapshot(data);
          setStatus('Loaded');
          return;
        } catch (e) {
          // ignore and try next
        }
      }

      setStatus('Could not fetch snapshot. Make sure the storage is hosted or server-sync is enabled.');
    })();
    return () => { alive = false; };
  }, [id]);

  if (!id) return (
    <div style={{ padding: 20 }}>
      <h2>Viewer</h2>
      <p>No share id provided in the URL.</p>
    </div>
  );

  return (
    <div style={{ padding: 20 }}>
      <h2>Shared Viewer — {id}</h2>
      <div style={{ marginBottom: 12, color: 'var(--muted)' }}>{status}</div>
      {snapshot && (
        <div>
          <div><strong>Updated:</strong> {snapshot.updatedAt}</div>
          <div style={{ marginTop: 8 }}>
            <h4>Floors (summary)</h4>
            <pre style={{ maxHeight: 240, overflow: 'auto' }}>{JSON.stringify(snapshot.floors || {}, null, 2)}</pre>
          </div>
          <div style={{ marginTop: 8 }}>
            <h4>Reservations</h4>
            <pre style={{ maxHeight: 160, overflow: 'auto' }}>{JSON.stringify(snapshot.reservations || [], null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
