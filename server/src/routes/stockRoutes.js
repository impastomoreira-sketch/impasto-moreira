import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

router.get("/", async (_, res) => {
  if (!pool) return res.json([]);
  const { rows } = await pool.query("select * from ingredients order by name");
  res.json(rows);
});

router.post("/", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  const { name, unit, stockQty, minQty, unitCost } = req.body || {};
  if (!name || !unit) return res.status(400).json({ error: "Nome e unidade são obrigatórios" });
  const { rows } = await pool.query(
    `insert into ingredients(name,unit,stock_qty,min_qty,unit_cost) values($1,$2,$3,$4,$5) returning *`,
    [name, unit, stockQty || 0, minQty || 0, unitCost || 0]
  );
  res.status(201).json(rows[0]);
});

router.patch("/:id", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  const { name, unit, minQty, unitCost } = req.body || {};
  const { rows } = await pool.query(
    `update ingredients set
       name=coalesce($1,name), unit=coalesce($2,unit),
       min_qty=coalesce($3,min_qty), unit_cost=coalesce($4,unit_cost)
     where id=$5 returning *`,
    [name, unit, minQty, unitCost, req.params.id]
  );
  res.json(rows[0] || {});
});

router.delete("/:id", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  try {
    await pool.query("delete from ingredients where id=$1", [req.params.id]);
    res.json({ deleted: true });
  } catch (e) {
    res.status(400).json({ error: "Não é possível excluir: esse ingrediente está vinculado a uma ficha técnica ou tem movimentações. Remova esses vínculos primeiro." });
  }
});

router.post("/movements", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  const { ingredientId, movementType, quantity, unitCost, reason } = req.body || {};
  if (!["Entrada", "Saída", "Ajuste"].includes(movementType)) return res.status(400).json({ error: "Tipo inválido" });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const delta = movementType === "Entrada" ? Number(quantity) : -Number(quantity);
    await client.query("update ingredients set stock_qty=stock_qty+$1 where id=$2", [delta, ingredientId]);
    if (movementType === "Entrada" && unitCost) {
      await client.query("update ingredients set unit_cost=$1 where id=$2", [unitCost, ingredientId]);
    }
    const m = await client.query(
      `insert into stock_movements(ingredient_id,movement_type,quantity,unit_cost,reason)
       values($1,$2,$3,$4,$5) returning *`,
      [ingredientId, movementType, quantity, unitCost || null, reason || null]
    );
    await client.query("commit");
    res.status(201).json(m.rows[0]);
  } catch (e) {
    await client.query("rollback");
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

router.get("/recipes/:productId", async (req, res) => {
  if (!pool) return res.json([]);
  const { rows } = await pool.query(
    `select r.id,r.ingredient_id,i.name ingredient_name,i.unit,r.quantity
     from recipes r join ingredients i on i.id=r.ingredient_id
     where r.product_id=$1 order by i.name`,
    [req.params.productId]
  );
  res.json(rows);
});

router.post("/recipes", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  const { productId, ingredientId, quantity } = req.body || {};
  const { rows } = await pool.query(
    `insert into recipes(product_id,ingredient_id,quantity) values($1,$2,$3)
     on conflict (product_id,ingredient_id) do update set quantity=excluded.quantity returning *`,
    [productId, ingredientId, quantity]
  );
  res.status(201).json(rows[0]);
});

router.delete("/recipes/:id", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  await pool.query("delete from recipes where id=$1", [req.params.id]);
  res.json({ deleted: true });
});

export default router;
