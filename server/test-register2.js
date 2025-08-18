const http = require('http');
const data = JSON.stringify({ state: { test: 'ok4' } });
const opts = {
  hostname: '127.0.0.1',
  port: 4000,
  path: '/register',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  },
};

const req = http.request(opts, (res) => {
  let b = '';
  res.on('data', (d) => (b += d));
  res.on('end', () => {
    console.log('STATUS', res.statusCode);
    try { console.log(JSON.parse(b)); } catch(e) { console.log(b); }
  });
});
req.on('error', (e) => { console.error('ERROR', e.message); process.exit(1); });
req.write(data);
req.end();
