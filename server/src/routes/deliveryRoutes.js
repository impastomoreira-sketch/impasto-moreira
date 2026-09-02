import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

router.get("/", async (_, res) => {
  if (!pool) return res.json([]);
  const { rows } = await pool.query("select * from delivery_zones order by neighborhood");
  res.json(rows);
});

router.post("/", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  const { neighborhood, city, fee } = req.body || {};
  if (!neighborhood || fee == null || fee === "") return res.status(400).json({ error: "Bairro e taxa são obrigatórios" });
  try {
    const { rows } = await pool.query(
      `insert into delivery_zones(neighborhood,city,fee) values($1,$2,$3)
       on conflict (neighborhood) do update set city=excluded.city, fee=excluded.fee, active=true
       returning *`,
      [neighborhood, city || null, fee]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.patch("/:id", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  const { fee, city, active, neighborhood } = req.body || {};
  const { rows } = await pool.query(
    `update delivery_zones set
       fee=coalesce($1,fee), city=coalesce($2,city),
       active=coalesce($3,active), neighborhood=coalesce($4,neighborhood)
     where id=$5 returning *`,
    [fee, city, active, neighborhood, req.params.id]
  );
  res.json(rows[0] || {});
});

router.delete("/:id", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  await pool.query("delete from delivery_zones where id=$1", [req.params.id]);
  res.json({ deleted: true });
});

export default router;
