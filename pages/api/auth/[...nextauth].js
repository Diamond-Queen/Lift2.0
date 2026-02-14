const NextAuth = require('next-auth');
const { authOptions } = require('../../../lib/authOptions');

module.exports = NextAuth.default(authOptions);
