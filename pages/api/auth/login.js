function handler(req, res) {
  // This endpoint is a prototype and conflicts with NextAuth credentials flow
  // implemented at /api/auth/[...nextauth].js. To avoid accidental use in
  // production, return 501 Not Implemented with a helpful message.
  res.status(501).json({ error: 'Not implemented. Use /api/auth/[...nextauth] (NextAuth) for authentication.' });
}

module.exports = handler;
