import fs from "fs";
import path from "path";

export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: "Missing code" });

  const file = path.join(process.cwd(), "data", "schoolCodes.json");
  try {
    const raw = fs.readFileSync(file, "utf8");
    const list = JSON.parse(raw || "[]");
    const found = list.find((s) => s.code.toLowerCase() === code.toLowerCase());
    if (!found) return res.status(404).json({ error: "Code not found" });
    return res.status(200).json({ ok: true, school: found });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
}
