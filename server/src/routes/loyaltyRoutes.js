import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

async function getSettings() {
  if (!pool) return { coin_expiry_days: 15, bonus_spin_every_orders: 10, daily_checkin_coins: 1, referral_coin_amount: 3 };
  const { rows } = await pool.query("select * from loyalty_settings where id=1");
  return rows[0] || { coin_expiry_days: 15, bonus_spin_every_orders: 10, daily_checkin_coins: 1, referral_coin_amount: 3 };
}

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

async function findCustomerByPhone(phone) {
  const { rows } = await pool.query(
    "select * from customers where regexp_replace(phone,'\\D','','g')=$1 order by id desc limit 1",
    [normalizePhone(phone)]
  );
  return rows[0] || null;
}

function pickPrize(prizes) {
  const total = prizes.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of prizes) {
    if (r < p.weight) return p;
    r -= p.weight;
  }
  return prizes[prizes.length - 1];
}

function genCouponCode() {
  return `RODA-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function getOrCreateReferralCode(customerId) {
  const cur = await pool.query("select referral_code from customers where id=$1", [customerId]);
  if (cur.rows[0]?.referral_code) return cur.rows[0].referral_code;
  let code;
  for (let i = 0; i < 5; i++) {
    code = Math.random().toString(36).slice(2, 8).toUpperCase();
    try {
      await pool.query("update customers set referral_code=$1 where id=$2", [code, customerId]);
      return code;
    } catch (e) {
      if (e.code !== "23505") throw e; // colisão de código único, tenta de novo
    }
  }
  return code;
}

// Status do cliente: saldo de moedas, giros disponíveis, sequência de check-in
router.get("/status", async (req, res) => {
  if (!pool) return res.json({ coins: 0, spinsAvailable: 0, streak: 0, referralCode: null });
  const phone = req.query.phone;
  if (!phone) return res.status(400).json({ error: "Informe o telefone" });

  const customer = await findCustomerByPhone(phone);
  if (!customer) return res.json({ coins: 0, spinsAvailable: 0, streak: 0, referralCode: null, checkedInToday: false });

  const coinsQ = await pool.query(
    "select coalesce(sum(amount),0) as total from loyalty_coins where customer_id=$1 and redeemed=false and expires_at > now()",
    [customer.id]
  );
  const spinsQ = await pool.query(
    "select count(*) as n from spin_credits where customer_id=$1 and used=false",
    [customer.id]
  );
  const lastCheckin = await pool.query(
    "select checkin_date, streak_count from daily_checkins where customer_id=$1 order by checkin_date desc limit 1",
    [customer.id]
  );
  const todayStr = new Date().toISOString().slice(0, 10);
  const checkedInToday = lastCheckin.rows[0]?.checkin_date?.toISOString?.().slice(0, 10) === todayStr;
  const referralCode = await getOrCreateReferralCode(customer.id);

  res.json({
    coins: Number(coinsQ.rows[0].total),
    spinsAvailable: Number(spinsQ.rows[0].n),
    streak: lastCheckin.rows[0]?.streak_count || 0,
    checkedInToday,
    referralCode
  });
});

// Check-in diário: dá 1 moeda por dia (crescendo com a sequência, até um teto),
// e um giro de bônus a cada 7 dias seguidos
router.post("/checkin", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  const { phone, name } = req.body || {};
  if (!phone || !name) return res.status(400).json({ error: "Informe nome e telefone" });

  const client = await pool.connect();
  try {
    await client.query("begin");

    const c = await client.query(
      `insert into customers(name,phone) values($1,$2)
       on conflict (name,phone) do update set name=excluded.name returning id`,
      [name.trim(), phone.trim()]
    );
    const customerId = c.rows[0].id;

    const todayStr = new Date().toISOString().slice(0, 10);
    const already = await client.query(
      "select 1 from daily_checkins where customer_id=$1 and checkin_date=$2",
      [customerId, todayStr]
    );
    if (already.rows[0]) {
      await client.query("rollback");
      return res.status(400).json({ error: "Você já fez o check-in de hoje. Volte amanhã!" });
    }

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const prev = await client.query(
      "select streak_count from daily_checkins where customer_id=$1 and checkin_date=$2",
      [customerId, yesterday]
    );
    const streak = (prev.rows[0]?.streak_count || 0) + 1;
    const coinsAwarded = Math.min(streak, 5);

    const settings = await getSettings();
    const expiresAt = new Date(Date.now() + settings.coin_expiry_days * 86400000);

    await client.query(
      "insert into daily_checkins(customer_id,checkin_date,streak_count,coins_awarded) values($1,$2,$3,$4)",
      [customerId, todayStr, streak, coinsAwarded]
    );
    await client.query(
      "insert into loyalty_coins(customer_id,amount,reason,expires_at) values($1,$2,'checkin',$3)",
      [customerId, coinsAwarded, expiresAt]
    );

    let bonusSpin = false;
    if (streak % 7 === 0) {
      await client.query(
        "insert into spin_credits(customer_id,reason) values($1,'checkin_streak')",
        [customerId]
      );
      bonusSpin = true;
    }

    await client.query("commit");
    res.json({ streak, coinsAwarded, bonusSpin });
  } catch (e) {
    await client.query("rollback");
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

// Gira a roleta: consome 1 giro disponível e sorteia um prêmio conforme o peso configurado
router.post("/spin", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  const { phone } = req.body || {};
  if (!phone) return res.status(400).json({ error: "Informe o telefone" });

  const client = await pool.connect();
  try {
    await client.query("begin");

    const customer = await client.query(
      "select id from customers where regexp_replace(phone,'\\D','','g')=$1 order by id desc limit 1",
      [normalizePhone(phone)]
    );
    if (!customer.rows[0]) throw new Error("Cliente não encontrado");
    const customerId = customer.rows[0].id;

    const credit = await client.query(
      "select id from spin_credits where customer_id=$1 and used=false order by created_at limit 1 for update",
      [customerId]
    );
    if (!credit.rows[0]) throw new Error("Nenhum giro disponível no momento");

    const prizesQ = await client.query("select * from spin_prizes where active=true order by sort_order");
    if (!prizesQ.rows.length) throw new Error("Nenhum prêmio configurado");
    const prize = pickPrize(prizesQ.rows);

    let couponCode = null;
    if (prize.discount_type) {
      const settings = await getSettings();
      couponCode = genCouponCode();
      const validUntil = new Date(Date.now() + settings.coin_expiry_days * 86400000);
      await client.query(
        `insert into coupons(code,discount_type,discount_value,min_order_value,max_uses,valid_until)
         values($1,$2,$3,0,1,$4)`,
        [couponCode, prize.discount_type, prize.discount_value, validUntil]
      );
    }

    await client.query(
      "update spin_credits set used=true, used_at=now(), prize_label=$1, coupon_code=$2 where id=$3",
      [prize.label, couponCode, credit.rows[0].id]
    );

    await client.query("commit");
    res.json({ prize: prize.label, couponCode });
  } catch (e) {
    await client.query("rollback");
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

export default router;
