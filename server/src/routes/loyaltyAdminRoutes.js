import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

router.get("/settings", async (_, res) => {
  try {
    if (!pool) return res.json({});
    const { rows } = await pool.query("select * from loyalty_settings where id=1");
    res.json(rows[0] || {});
  } catch (e) {
    console.error("[loyalty/settings GET]", e);
    res.status(500).json({ error: e.message });
  }
});

router.patch("/settings", async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
    const b = req.body || {};
    const coinExpiryDays = b.coinExpiryDays ?? null;
    const bonusSpinEveryOrders = b.bonusSpinEveryOrders ?? null;
    const dailyCheckinCoins = b.dailyCheckinCoins ?? null;
    const referralCoinAmount = b.referralCoinAmount ?? null;
    const coinValueReais = b.coinValueReais ?? null;
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
  } catch (e) {
    console.error("[loyalty/settings PATCH]", e);
    res.status(500).json({ error: e.message });
  }
});

router.get("/prizes", async (_, res) => {
  try {
    if (!pool) return res.json([]);
    const { rows } = await pool.query("select * from spin_prizes order by sort_order");
    res.json(rows);
  } catch (e) {
    console.error("[loyalty/prizes GET]", e);
    res.status(500).json({ error: e.message });
  }
});

router.post("/prizes", async (req, res) => {
  try {
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
  } catch (e) {
    console.error("[loyalty/prizes POST]", e);
    res.status(500).json({ error: e.message });
  }
});

router.patch("/prizes/:id", async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
    const b = req.body || {};
    if (b.discountType && !["percent", "fixed"].includes(b.discountType)) {
      return res.status(400).json({ error: "Tipo de desconto inválido" });
    }

    // Monta o UPDATE só com os campos que realmente vieram na requisição —
    // assim dá pra editar um campo de cada vez (como a tabela do admin faz)
    // e também dá pra "limpar" um campo de propósito (ex: tipo = null).
    const fields = [];
    const values = [];
    let i = 1;
    const set = (column, key) => {
      if (key in b) { fields.push(`${column}=$${i++}`); values.push(b[key]); }
    };
    set("label", "label");
    set("discount_type", "discountType");
    set("discount_value", "discountValue");
    set("weight", "weight");
    set("active", "active");
    set("sort_order", "sortOrder");

    if (!fields.length) return res.status(400).json({ error: "Nada para atualizar" });
    values.push(req.params.id);

    const { rows } = await pool.query(
      `update spin_prizes set ${fields.join(", ")} where id=$${i} returning *`,
      values
    );
    res.json(rows[0] || {});
  } catch (e) {
    console.error("[loyalty/prizes PATCH]", e);
    res.status(500).json({ error: e.message });
  }
});

router.delete("/prizes/:id", async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
    await pool.query("delete from spin_prizes where id=$1", [req.params.id]);
    res.json({ deleted: true });
  } catch (e) {
    console.error("[loyalty/prizes DELETE]", e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
