import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import { JWT_SECRET, auth } from "../middleware/auth.js";

const router = Router();

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Informe e-mail e senha" });
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  try {
    const { rows } = await pool.query(
      "select id,name,email,password_hash,role,active from users where email=$1",
      [email.toLowerCase().trim()]
    );
    const user = rows[0];
    if (!user || !user.active) return res.status(401).json({ error: "E-mail ou senha inválidos" });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "E-mail ou senha inválidos" });
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "10h" }
    );
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/me", auth, (req, res) => res.json(req.user));

export default router;
