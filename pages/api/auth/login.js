export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Missing fields" });

  // Prototype: no DB validation. In production, validate password and return a token/session.
  const user = { name: email.split("@")[0], email };
  return res.status(200).json({ ok: true, user });
}
