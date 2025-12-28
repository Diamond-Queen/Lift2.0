import NextAuth from 'next-auth';
const { authOptions } = require('../../../lib/authOptions');

export default NextAuth(authOptions);
