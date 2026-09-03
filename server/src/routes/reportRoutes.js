import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

router.get("/sales-by-day", async (_, res) => {
  if (!pool) return res.json([]);
  const { rows } = await pool.query(`
    select date_trunc('day',created_at)::date as day, sum(total) as total, count(*) as orders
    from orders where status<>'Cancelado'
    group by 1 order by 1 desc limit 30`);
  res.json(rows);
});

router.get("/top-products", async (_, res) => {
  if (!pool) return res.json([]);
  const { rows } = await pool.query(`
    select oi.product_name, sum(oi.quantity) qty, sum(oi.subtotal) revenue
    from order_items oi join orders o on o.id=oi.order_id
    where o.status<>'Cancelado'
    group by oi.product_name order by revenue desc limit 20`);
  res.json(rows);
});

router.get("/by-category", async (_, res) => {
  if (!pool) return res.json([]);
  const { rows } = await pool.query(`
    select c.name category, sum(oi.subtotal) revenue
    from order_items oi
    join products p on p.id=oi.product_id
    join categories c on c.id=p.category_id
    join orders o on o.id=oi.order_id
    where o.status<>'Cancelado'
    group by c.name order by revenue desc`);
  res.json(rows);
});

router.get("/low-stock", async (_, res) => {
  if (!pool) return res.json([]);
  const { rows } = await pool.query("select * from ingredients where stock_qty<=min_qty order by name");
  res.json(rows);
});

// CMV (Custo da Mercadoria Vendida) — teórico por produto, com base na ficha técnica atual,
// e o CMV realizado, ponderado pelas vendas de fato registradas nos pedidos.
router.get("/cmv", async (_, res) => {
  if (!pool) return res.json({ products: [], overall: { totalCost: 0, totalRevenue: 0, cmvPercent: 0 }, targetMarkupPercent: 230 });

  const settingsRows = await pool.query("select value from settings where key='target_markup_percent'");
  const targetMarkupPercent = Number(settingsRows.rows[0]?.value || 230);

  const perProduct = await pool.query(`
    select p.id, p.name, p.price, p.manual_cost,
      coalesce(sum(r.quantity * i.unit_cost),0) as recipe_cost
    from products p
    left join recipes r on r.product_id = p.id
    left join ingredients i on i.id = r.ingredient_id
    where p.active = true
    group by p.id, p.name, p.price, p.manual_cost
    order by p.name`);

  const products = perProduct.rows.map(row => {
    const price = Number(row.price);
    const hasManualCost = row.manual_cost != null && Number(row.manual_cost) > 0;
    const cost = hasManualCost ? Number(row.manual_cost) : Number(row.recipe_cost);
    const costSource = hasManualCost ? "manual" : "ficha técnica";
    const cmvPercent = price > 0 ? (cost / price) * 100 : 0;
    const suggestedPrice = cost * (1 + targetMarkupPercent / 100);
    return {
      id: row.id,
      name: row.name,
      price,
      cost: Number(cost.toFixed(2)),
      costSource,
      cmvPercent: Number(cmvPercent.toFixed(1)),
      marginPercent: Number((100 - cmvPercent).toFixed(1)),
      profitPerUnit: Number((price - cost).toFixed(2)),
      suggestedPrice: Number(suggestedPrice.toFixed(2))
    };
  });

  const overallQuery = await pool.query(`
    select
      coalesce(sum(oi.quantity * coalesce(nullif(p.manual_cost,0), rc.unit_cost, 0)),0) as total_cost,
      coalesce(sum(oi.subtotal),0) as total_revenue
    from order_items oi
    join orders o on o.id = oi.order_id
    join products p on p.id = oi.product_id
    left join (
      select r.product_id, sum(r.quantity * i.unit_cost) as unit_cost
      from recipes r join ingredients i on i.id = r.ingredient_id
      group by r.product_id
    ) rc on rc.product_id = oi.product_id
    where o.status <> 'Cancelado'`);

  const totalCost = Number(overallQuery.rows[0].total_cost);
  const totalRevenue = Number(overallQuery.rows[0].total_revenue);
  const cmvPercent = totalRevenue > 0 ? Number(((totalCost / totalRevenue) * 100).toFixed(1)) : 0;

  res.json({ products, overall: { totalCost: Number(totalCost.toFixed(2)), totalRevenue: Number(totalRevenue.toFixed(2)), cmvPercent }, targetMarkupPercent });
});

export default router;
