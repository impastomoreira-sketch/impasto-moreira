import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

router.get("/sales-by-day", async (_, res) => {
  if (!pool) return res.json([]);
  const { rows } = await pool.query(`
    select date_trunc('day',created_at)::date day, sum(total) total, count(*) orders
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

export default router;
