export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { name, email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Missing fields" });

  // Prototype: no DB, return the user object. In production, replace with real DB and hashing.
  const user = { name: name || "", email };
  return res.status(200).json({ ok: true, user });
}
