import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";

const router = Router();

router.get("/", async (_, res) => {
  if (!pool) return res.json([]);
  const { rows } = await pool.query("select id,name,email,role,active,created_at from users order by name");
  res.json(rows);
});

router.post("/", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  const { name, email, password, role } = req.body || {};
  if (!["admin", "atendimento", "cozinha"].includes(role)) return res.status(400).json({ error: "Papel inválido" });
  if (!name || !email || !password) return res.status(400).json({ error: "Nome, e-mail e senha são obrigatórios" });
  if (password.length < 6) return res.status(400).json({ error: "Senha deve ter ao menos 6 caracteres" });
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query(
      `insert into users(name,email,password_hash,role) values($1,$2,$3,$4)
       returning id,name,email,role,active`,
      [name, email.toLowerCase().trim(), hash, role]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.code === "23505" ? "E-mail já cadastrado" : e.message });
  }
});

router.patch("/:id", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  const { name, role, active, password } = req.body || {};
  const hash = password ? await bcrypt.hash(password, 10) : null;
  const { rows } = await pool.query(
    `update users set
       name=coalesce($1,name), role=coalesce($2,role),
       active=coalesce($3,active), password_hash=coalesce($4,password_hash)
     where id=$5 returning id,name,email,role,active`,
    [name, role, active, hash, req.params.id]
  );
  res.json(rows[0] || {});
});

export default router;
