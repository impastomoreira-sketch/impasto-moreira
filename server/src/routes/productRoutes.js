import { Router } from "express";
import { pool } from "../db.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();

router.get("/categories", requireRole("admin", "atendimento", "cozinha"), async (_, res) => {
  if (!pool) return res.json([]);
  const { rows } = await pool.query("select * from categories order by sort_order,name");
  res.json(rows);
});

router.post("/categories", requireRole("admin"), async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  const { name, sortOrder } = req.body || {};
  const { rows } = await pool.query(
    "insert into categories(name,sort_order) values($1,$2) returning *",
    [name, sortOrder || 0]
  );
  res.status(201).json(rows[0]);
});

router.get("/", requireRole("admin", "atendimento", "cozinha"), async (_, res) => {
  if (!pool) return res.json([]);
  const { rows } = await pool.query(`
    select p.*,c.name category_name from products p
    join categories c on c.id=p.category_id order by c.sort_order,p.name`);
  res.json(rows);
});

router.post("/", requireRole("admin"), async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  const { name, categoryId, description, price, imageUrl } = req.body || {};
  if (!name || !categoryId || !price) return res.status(400).json({ error: "Nome, categoria e preço são obrigatórios" });
  const { rows } = await pool.query(
    `insert into products(name,category_id,description,price,image_url) values($1,$2,$3,$4,$5) returning *`,
    [name, categoryId, description || null, price, imageUrl || null]
  );
  res.status(201).json(rows[0]);
});

router.patch("/:id", requireRole("admin"), async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  const { name, categoryId, description, price, imageUrl, active } = req.body || {};
  const { rows } = await pool.query(
    `update products set
       name=coalesce($1,name), category_id=coalesce($2,category_id),
       description=coalesce($3,description), price=coalesce($4,price),
       image_url=coalesce($5,image_url), active=coalesce($6,active)
     where id=$7 returning *`,
    [name, categoryId, description, price, imageUrl, active, req.params.id]
  );
  res.json(rows[0] || {});
});

export default router;
