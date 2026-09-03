import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

router.get("/", async (_, res) => {
  if (!pool) return res.json([]);
  const { rows } = await pool.query("select * from payment_methods order by sort_order,name");
  res.json(rows);
});

router.post("/", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  const { name, sortOrder } = req.body || {};
  if (!name) return res.status(400).json({ error: "Nome é obrigatório" });
  try {
    const { rows } = await pool.query(
      "insert into payment_methods(name,sort_order) values($1,$2) returning *",
      [name, sortOrder || 0]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.code === "23505" ? "Já existe uma forma de pagamento com esse nome" : e.message });
  }
});

router.patch("/:id", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  const { name, active, sortOrder } = req.body || {};
  const { rows } = await pool.query(
    "update payment_methods set name=coalesce($1,name), active=coalesce($2,active), sort_order=coalesce($3,sort_order) where id=$4 returning *",
    [name, active, sortOrder, req.params.id]
  );
  res.json(rows[0] || {});
});

router.delete("/:id", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  await pool.query("delete from payment_methods where id=$1", [req.params.id]);
  res.json({ deleted: true });
});

export default router;
