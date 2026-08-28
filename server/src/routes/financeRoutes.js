import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

router.get("/", async (_, res) => {
  if (!pool) return res.json([]);
  const { rows } = await pool.query(
    "select * from finance_entries order by created_at desc limit 300"
  );
  res.json(rows);
});

router.post("/", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  const { entryType, description, amount, dueDate, paidAt } = req.body || {};
  if (!["Receita", "Despesa"].includes(entryType)) return res.status(400).json({ error: "Tipo inválido" });
  if (!description || !amount) return res.status(400).json({ error: "Descrição e valor são obrigatórios" });
  const { rows } = await pool.query(
    `insert into finance_entries(entry_type,description,amount,due_date,paid_at)
     values($1,$2,$3,$4,$5) returning *`,
    [entryType, description, amount, dueDate || null, paidAt || null]
  );
  res.status(201).json(rows[0]);
});

router.get("/summary", async (_, res) => {
  if (!pool) return res.json({ revenue: 0, expenses: 0, balance: 0 });
  const { rows } = await pool.query(`
    select
      coalesce(sum(case when entry_type='Receita' then amount end),0) revenue,
      coalesce(sum(case when entry_type='Despesa' then amount end),0) expenses
    from finance_entries`);
  const r = rows[0];
  res.json({ revenue: Number(r.revenue), expenses: Number(r.expenses), balance: Number(r.revenue) - Number(r.expenses) });
});

export default router;
