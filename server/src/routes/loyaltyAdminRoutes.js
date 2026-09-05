import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

router.get("/settings", async (_, res) => {
  if (!pool) return res.json({});
  const { rows } = await pool.query("select * from loyalty_settings where id=1");
  res.json(rows[0] || {});
});

router.patch("/settings", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  const { coinExpiryDays, bonusSpinEveryOrders, dailyCheckinCoins, referralCoinAmount, coinValueReais } = req.body || {};
  const { rows } = await pool.query(
    `update loyalty_settings set
       coin_expiry_days=coalesce($1,coin_expiry_days),
       bonus_spin_every_orders=coalesce($2,bonus_spin_every_orders),
       daily_checkin_coins=coalesce($3,daily_checkin_coins),
       referral_coin_amount=coalesce($4,referral_coin_amount),
       coin_value_reais=coalesce($5,coin_value_reais)
     where id=1 returning *`,
    [coinExpiryDays, bonusSpinEveryOrders, dailyCheckinCoins, referralCoinAmount, coinValueReais]
  );
  res.json(rows[0]);
});

router.get("/prizes", async (_, res) => {
  if (!pool) return res.json([]);
  const { rows } = await pool.query("select * from spin_prizes order by sort_order");
  res.json(rows);
});

router.post("/prizes", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  const { label, discountType, discountValue, weight, sortOrder } = req.body || {};
  if (!label) return res.status(400).json({ error: "Informe o nome do prêmio" });
  if (discountType && !["percent", "fixed"].includes(discountType)) {
    return res.status(400).json({ error: "Tipo de desconto inválido" });
  }
  const { rows } = await pool.query(
    `insert into spin_prizes(label,discount_type,discount_value,weight,sort_order)
     values($1,$2,$3,$4,$5) returning *`,
    [label.trim(), discountType || null, discountValue ?? null, weight || 1, sortOrder ?? 99]
  );
  res.status(201).json(rows[0]);
});

router.patch("/prizes/:id", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  const { label, discountType, discountValue, weight, active, sortOrder } = req.body || {};
  if (discountType && !["percent", "fixed"].includes(discountType)) {
    return res.status(400).json({ error: "Tipo de desconto inválido" });
  }
  const { rows } = await pool.query(
    `update spin_prizes set
       label=coalesce($1,label),
       discount_type=coalesce($2,discount_type),
       discount_value=coalesce($3,discount_value),
       weight=coalesce($4,weight),
       active=coalesce($5,active),
       sort_order=coalesce($6,sort_order)
     where id=$7 returning *`,
    [label, discountType, discountValue, weight, active, sortOrder, req.params.id]
  );
  res.json(rows[0] || {});
});

router.delete("/prizes/:id", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  await pool.query("delete from spin_prizes where id=$1", [req.params.id]);
  res.json({ deleted: true });
});

export default router;
