jest.mock(require('path').join(__dirname, '..', 'lib', 'prisma.js'), () => ({
  user: {
    findUnique: jest.fn(async () => null)
  }
}), { virtual: false });

const handler = require('../pages/api/user').default;

function mockRes(){const r={};r.statusCode=200;r.headers={};r.setHeader=(k,v)=>{r.headers[k]=v};r.status=(c)=>{r.statusCode=c;return r};r.jsonData=null;r.json=(d)=>{r.jsonData=d;return r};return r;}
function mockReq(session){return { headers:{}, socket:{remoteAddress:'127.0.0.1'}, method:'GET', session }}

// Mock next-auth getSession by monkey patching at runtime
jest.mock('next-auth/react', () => ({ getSession: jest.fn(async () => null) }));

const { getSession } = require('next-auth/react');

test('user endpoint unauthorized without session', async () => {
  const req = mockReq();
  const res = mockRes();
  await handler(req,res);
  expect(res.statusCode).toBe(401);
  expect(res.jsonData.ok).toBe(false);
});
