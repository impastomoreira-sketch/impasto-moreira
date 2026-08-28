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
    whatsappNumber: s.whatsapp_number || ""
  });
});

router.get("/menu", async (_, res) => {
  if (!pool) return res.json([]);
  const { rows } = await pool.query(`
    select p.id,p.name,p.description,p.price,p.image_url,c.name category
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

router.post("/orders", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  const { customer, phone, orderType, address, paymentMethod, items, notes } = req.body || {};

  if (!customer || !phone) return res.status(400).json({ error: "Informe nome e telefone" });
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: "Carrinho vazio" });
  if (!["Delivery", "Retirada"].includes(orderType)) return res.status(400).json({ error: "Tipo de pedido inválido" });
  if (orderType === "Delivery" && (!address || !address.street || !address.neighborhood)) {
    return res.status(400).json({ error: "Endereço de entrega incompleto" });
  }

  const client = await pool.connect();
  try {
    await client.query("begin");

    const c = await client.query(
      `insert into customers(name,phone) values($1,$2)
       on conflict (name,phone) do update set name=excluded.name returning id`,
      [customer.trim(), phone.trim()]
    );
    const customerId = c.rows[0].id;

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
        "select id,name,price from products where id=$1 and active=true",
        [item.productId]
      );
      if (!p.rows[0]) throw new Error("Um dos produtos do carrinho não está mais disponível");
      const quantity = Math.max(1, Number(item.quantity || 1));
      const lineTotal = Number(p.rows[0].price) * quantity;
      subtotal += lineTotal;
      priced.push({ productId: p.rows[0].id, name: p.rows[0].name, quantity, unitPrice: p.rows[0].price, lineTotal });
    }

    const deliveryFee = orderType === "Delivery" ? await getDeliveryFee(address.neighborhood) : 0;
    const total = subtotal + deliveryFee;

    const o = await client.query(
      `insert into orders(customer_id,address_id,order_type,status,payment_method,subtotal,delivery_fee,total,notes)
       values($1,$2,$3,'Recebido',$4,$5,$6,$7,$8) returning id,total,status,created_at`,
      [customerId, addressId, orderType, paymentMethod || "A combinar", subtotal, deliveryFee, total, notes || null]
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
    res.status(201).json({ orderId, total, status: "Recebido" });
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
