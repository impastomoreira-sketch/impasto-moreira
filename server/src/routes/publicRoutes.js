import { Router } from "express";
import { pool } from "../db.js";
import { getDeliveryFee } from "../utils/deliveryFee.js";
import { readSettings } from "./settingsRoutes.js";

const router = Router();

// Apenas os campos não sensíveis ficam expostos ao cardápio público
router.get("/settings", async (_, res) => {
  const s = await readSettings();
  res.json({
    restaurantName: s.restaurant_name || "Impasto Moreira",
    whatsappNumber: s.whatsapp_number || "",
    instagramUrl: s.instagram_url || ""
  });
});

router.get("/menu", async (_, res) => {
  if (!pool) return res.json([]);
  const { rows } = await pool.query(`
    select p.id,p.name,p.description,p.price,p.image_url,p.promo_price,p.promo_days,
      (p.promo_active AND (p.promo_days IS NULL OR array_length(p.promo_days,1) IS NULL
        OR to_char(now() at time zone 'America/Sao_Paulo','dy') = ANY(p.promo_days))
      ) as promo_active,
      c.name category
    from products p join categories c on c.id=p.category_id
    where p.active=true order by c.sort_order,p.name`);
  res.json(rows);
});

router.get("/delivery-zones", async (_, res) => {
  if (!pool) return res.json([]);
  const { rows } = await pool.query(
    "select neighborhood,fee from delivery_zones where active=true and neighborhood<>'PADRÃO' order by neighborhood"
  );
  res.json(rows);
});

router.get("/delivery-fee", async (req, res) => {
  const fee = await getDeliveryFee(req.query.neighborhood || "");
  res.json({ fee });
});

router.get("/payment-methods", async (_, res) => {
  if (!pool) return res.json([]);
  const { rows } = await pool.query("select name from payment_methods where active=true order by sort_order,name");
  res.json(rows.map(r => r.name));
});

// Verifica um cupom sem finalizar o pedido, usado pelo botão "Aplicar cupom" no checkout
router.post("/coupons/validate", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  const { code, subtotal } = req.body || {};
  if (!code) return res.status(400).json({ error: "Informe um código de cupom" });
  const { rows } = await pool.query("select * from coupons where code=$1", [String(code).toUpperCase().trim()]);
  const coupon = rows[0];
  if (!coupon || !coupon.active) return res.status(404).json({ error: "Cupom inválido ou inativo" });
  if (coupon.valid_until && new Date(coupon.valid_until) < new Date()) return res.status(400).json({ error: "Cupom expirado" });
  if (coupon.max_uses != null && coupon.used_count >= coupon.max_uses) return res.status(400).json({ error: "Cupom esgotado" });
  if (Number(subtotal || 0) < Number(coupon.min_order_value || 0)) {
    return res.status(400).json({ error: `Pedido mínimo para este cupom: ${Number(coupon.min_order_value).toFixed(2)}` });
  }
  const discountAmount = coupon.discount_type === "percent"
    ? Number(subtotal) * (Number(coupon.discount_value) / 100)
    : Number(coupon.discount_value);
  res.json({ valid: true, code: coupon.code, discountAmount: Math.min(discountAmount, Number(subtotal)) });
});

router.post("/orders", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  const { customer, phone, orderType, address, paymentMethod, items, notes, couponCode, tableNumber, referralCode } = req.body || {};

  if (!customer || !phone) return res.status(400).json({ error: "Informe nome e telefone" });
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: "Carrinho vazio" });
  if (!["Delivery", "Retirada", "Mesa"].includes(orderType)) return res.status(400).json({ error: "Tipo de pedido inválido" });
  if (orderType === "Delivery" && (!address || !address.street || !address.neighborhood)) {
    return res.status(400).json({ error: "Endereço de entrega incompleto" });
  }
  if (orderType === "Mesa" && !tableNumber) {
    return res.status(400).json({ error: "Informe o número da mesa" });
  }

  const client = await pool.connect();
  try {
    await client.query("begin");

    // "xmax = 0" indica que a linha acabou de ser inserida agora (cliente novo),
    // e não uma atualização de um cliente que já existia — usado para só
    // vincular o código de indicação na primeira vez que esse cliente aparece.
    const c = await client.query(
      `insert into customers(name,phone) values($1,$2)
       on conflict (name,phone) do update set name=excluded.name
       returning id, (xmax = 0) as is_new`,
      [customer.trim(), phone.trim()]
    );
    const customerId = c.rows[0].id;
    const isNewCustomer = c.rows[0].is_new;

    if (isNewCustomer && referralCode) {
      const referrer = await client.query(
        "select id from customers where referral_code=$1",
        [String(referralCode).toUpperCase().trim()]
      );
      if (referrer.rows[0] && referrer.rows[0].id !== customerId) {
        await client.query(
          "insert into referrals(referrer_customer_id,referred_customer_id,referred_phone) values($1,$2,$3)",
          [referrer.rows[0].id, customerId, phone.trim()]
        );
      }
    }

    let addressId = null;
    if (orderType === "Delivery") {
      const a = await client.query(
        `insert into addresses(customer_id,street,number,complement,neighborhood,city,state,zip)
         values($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
        [
          customerId,
          address.street,
          address.number || "",
          address.complement || "",
          address.neighborhood,
          address.city || "",
          address.state || "",
          address.zip || ""
        ]
      );
      addressId = a.rows[0].id;
    }

    let subtotal = 0;
    const priced = [];
    for (const item of items) {
      const p = await client.query(
        `select id,name,price,promo_price,
           (promo_active AND (promo_days IS NULL OR array_length(promo_days,1) IS NULL
             OR to_char(now() at time zone 'America/Sao_Paulo','dy') = ANY(promo_days))
           ) as promo_eligible
         from products where id=$1 and active=true`,
        [item.productId]
      );
      if (!p.rows[0]) throw new Error("Um dos produtos do carrinho não está mais disponível");
      const row = p.rows[0];
      const effectivePrice = row.promo_eligible && row.promo_price != null && Number(row.promo_price) < Number(row.price)
        ? Number(row.promo_price)
        : Number(row.price);
      const quantity = Math.max(1, Number(item.quantity || 1));
      const lineTotal = effectivePrice * quantity;
      subtotal += lineTotal;
      priced.push({ productId: row.id, name: row.name, quantity, unitPrice: effectivePrice, lineTotal });
    }

    const deliveryFee = orderType === "Delivery" ? await getDeliveryFee(address.neighborhood) : 0;

    // Cupom: revalidado aqui de novo (nunca confia em valor calculado pelo navegador)
    let discountAmount = 0;
    let appliedCouponCode = null;
    if (couponCode) {
      const cq = await client.query("select * from coupons where code=$1", [String(couponCode).toUpperCase().trim()]);
      const coupon = cq.rows[0];
      if (coupon && coupon.active
        && (!coupon.valid_until || new Date(coupon.valid_until) >= new Date())
        && (coupon.max_uses == null || coupon.used_count < coupon.max_uses)
        && subtotal >= Number(coupon.min_order_value || 0)) {
        discountAmount = coupon.discount_type === "percent"
          ? subtotal * (Number(coupon.discount_value) / 100)
          : Number(coupon.discount_value);
        discountAmount = Math.min(discountAmount, subtotal);
        appliedCouponCode = coupon.code;
        await client.query("update coupons set used_count=used_count+1 where id=$1", [coupon.id]);
      }
    }

    const total = subtotal - discountAmount + deliveryFee;

    const o = await client.query(
      `insert into orders(customer_id,address_id,order_type,status,payment_method,subtotal,delivery_fee,total,notes,coupon_code,discount_amount,table_number)
       values($1,$2,$3,'Recebido',$4,$5,$6,$7,$8,$9,$10,$11) returning id,total,status,created_at`,
      [customerId, addressId, orderType, paymentMethod || "A combinar", subtotal, deliveryFee, total, notes || null, appliedCouponCode, discountAmount, tableNumber || null]
    );
    const orderId = o.rows[0].id;

    for (const x of priced) {
      await client.query(
        `insert into order_items(order_id,product_id,product_name,quantity,unit_price,subtotal)
         values($1,$2,$3,$4,$5,$6)`,
        [orderId, x.productId, x.name, x.quantity, x.unitPrice, x.lineTotal]
      );
    }

    await client.query(
      "insert into order_status_history(order_id,status) values($1,'Recebido')",
      [orderId]
    );

    await client.query(
      `insert into finance_entries(entry_type,description,amount,order_id)
       values('Receita',$1,$2,$3)`,
      [`Pedido #${orderId}`, total, orderId]
    );

    await client.query("commit");
    res.status(201).json({ orderId, total, status: "Recebido", discountAmount });
  } catch (e) {
    await client.query("rollback");
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

router.get("/orders/:id/status", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  const { rows } = await pool.query(
    "select id,status,total,order_type,created_at,updated_at from orders where id=$1",
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Pedido não encontrado" });
  res.json(rows[0]);
});

export default router;
