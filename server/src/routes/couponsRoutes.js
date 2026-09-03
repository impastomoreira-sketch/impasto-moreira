import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

router.get("/", async (_, res) => {
  if (!pool) return res.json([]);
  const { rows } = await pool.query("select * from coupons order by created_at desc");
  res.json(rows);
});

router.post("/", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  const { code, discountType, discountValue, minOrderValue, maxUses, validUntil } = req.body || {};
  if (!code || !discountType || !discountValue) return res.status(400).json({ error: "Código, tipo e valor do desconto são obrigatórios" });
  if (!["percent", "fixed"].includes(discountType)) return res.status(400).json({ error: "Tipo de desconto inválido" });
  try {
    const { rows } = await pool.query(
      `insert into coupons(code,discount_type,discount_value,min_order_value,max_uses,valid_until)
       values($1,$2,$3,$4,$5,$6) returning *`,
      [code.toUpperCase().trim(), discountType, discountValue, minOrderValue || 0, maxUses || null, validUntil || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.code === "23505" ? "Já existe um cupom com esse código" : e.message });
  }
});

router.patch("/:id", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  const { active, discountValue, minOrderValue, maxUses, validUntil } = req.body || {};
  const { rows } = await pool.query(
    `update coupons set
       active=coalesce($1,active), discount_value=coalesce($2,discount_value),
       min_order_value=coalesce($3,min_order_value), max_uses=coalesce($4,max_uses),
       valid_until=coalesce($5,valid_until)
     where id=$6 returning *`,
    [active, discountValue, minOrderValue, maxUses, validUntil, req.params.id]
  );
  res.json(rows[0] || {});
});

router.delete("/:id", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  await pool.query("delete from coupons where id=$1", [req.params.id]);
  res.json({ deleted: true });
});

export default router;
