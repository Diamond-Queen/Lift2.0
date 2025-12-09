jest.mock(require('path').join(__dirname, '..', 'lib', 'prisma.js'), () => ({
  user: {
    findUnique: jest.fn(async () => null),
    create: jest.fn(async (args) => ({ id: 'u_1', email: args.data.email }))
  }
}), { virtual: false });

const handler = require('../pages/api/auth/register').default;

function mockRes() {
  const res = {};
  res.statusCode = 200;
  res.headers = {};
  res.setHeader = (k,v)=>{res.headers[k]=v};
  res.status = (c)=>{res.statusCode=c; return res};
  res.jsonData = null;
  res.json = (d)=>{res.jsonData=d; return res};
  return res;
}

function mockReq(method, body) {
  return { method, body, headers: {}, socket: { remoteAddress: '127.0.0.1' } };
}

test('register method not allowed', async () => {
  const req = mockReq('GET');
  const res = mockRes();
  await handler(req,res);
  expect(res.statusCode).toBe(405);
  expect(res.jsonData.ok).toBe(false);
});

test('register missing fields', async () => {
  const req = mockReq('POST', { email: '' });
  const res = mockRes();
  await handler(req,res);
  expect(res.statusCode).toBe(400);
  expect(res.jsonData.error).toMatch(/Email and password/);
});
