// Invoke the Next.js API handler directly (no network) to inspect behavior.
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const modPath = path.resolve(__dirname, '../pages/api/career.js');
  const api = await import('file://' + modPath);
  const handler = api.default;

  const body = {
    type: 'resume',
    name: 'Test User',
    email: 'test@example.com',
    phone: '555-1234',
    address: '123 Main St',
    linkedin: 'https://linkedin.example/test',
    objective: 'Entry-level software engineering role',
    experience: [ { title: 'Intern', company: 'Acme', dates: '2023', details: 'Worked on X' } ],
    education: [ { degree: 'High School Diploma', school: 'Central High School', dates: '2018-2021' } ],
    skills: ['JavaScript','React'],
    certifications: ['Cert A']
  };

  const req = { method: 'POST', body };
  let resp = { statusCode: 200, body: null };
  const res = {
    status(code) { resp.statusCode = code; return this; },
    json(obj) { resp.body = obj; return Promise.resolve(obj); }
  };

  try {
    await handler(req, res);
    console.log('Direct invoke result:', JSON.stringify(resp, null, 2));
  } catch (err) {
    console.error('Handler threw:', err);
  }
}

run();
