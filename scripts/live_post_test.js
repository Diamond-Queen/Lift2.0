const http = require('http');

const endpointHost = 'localhost';
const endpointPort = 3000;
const endpointPath = '/api/beta/register';
const attempts = 120;

function wait(ms){ return new Promise(r=>setTimeout(r,ms)); }

function sendOnce(i){
  return new Promise((resolve) => {
    const body = JSON.stringify({ trialType: 'social' });
    const opts = {
      hostname: endpointHost,
      port: endpointPort,
      path: endpointPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = http.request(opts, (res) => {
      let acc = '';
      res.on('data', (chunk) => acc += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, body: acc });
      });
    });
    req.on('error', (err) => resolve({ error: err.message }));
    req.write(body);
    req.end();
  });
}

(async()=>{
  for(let i=1;i<=attempts;i++){
    const r = await sendOnce(i);
    if (!r) {
      console.log(`#${i} -> ERROR: no response`);
    } else if (r.error) {
      console.log(`#${i} -> ERROR: ${r.error}`);
    } else {
      const bodySnippet = (r.body || '').slice(0,200).replace(/\n/g,' ');
      console.log(`#${i} -> ${r.status} | ${bodySnippet}`);
    }
    await wait(150);
  }
  console.log('done');
})();
