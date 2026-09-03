import { Router } from "express";
import { pool } from "../db.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();

const STATUS_FLOW = ["Recebido", "Preparando", "Pronto", "Saiu para entrega", "Entregue", "Cancelado"];
const KITCHEN_ALLOWED = ["Preparando", "Pronto"];

router.get("/", requireRole("admin", "atendimento", "cozinha"), async (req, res) => {
  if (!pool) return res.json([]);
  const params = [];
  let where = "";
  if (req.query.status) {
    params.push(req.query.status);
    where = "where o.status=$1";
  }
  const { rows } = await pool.query(
    `select o.id,c.name customer,c.phone,o.order_type,o.status,o.payment_method,
            o.subtotal,o.delivery_fee,o.discount_amount,o.coupon_code,o.table_number,o.total,o.notes,o.created_at,
            a.street,a.number,a.complement,a.neighborhood,a.city
     from orders o
     left join customers c on c.id=o.customer_id
     left join addresses a on a.id=o.address_id
     ${where}
     order by o.created_at desc limit 300`,
    params
  );
  res.json(rows);
});

router.get("/:id/items", requireRole("admin", "atendimento", "cozinha"), async (req, res) => {
  if (!pool) return res.json([]);
  const { rows } = await pool.query(
    "select product_name,quantity,unit_price,subtotal from order_items where order_id=$1",
    [req.params.id]
  );
  res.json(rows);
});

router.patch("/:id/status", requireRole("admin", "atendimento", "cozinha"), async (req, res) => {  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  const { status } = req.body || {};
  if (!STATUS_FLOW.includes(status)) return res.status(400).json({ error: "Status inválido" });
  if (req.user.role === "cozinha" && !KITCHEN_ALLOWED.includes(status)) {
    return res.status(403).json({ error: "A cozinha só pode marcar Preparando ou Pronto" });
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    const cur = await client.query("select status from orders where id=$1 for update", [req.params.id]);
    if (!cur.rows[0]) throw new Error("Pedido não encontrado");

    // Ao iniciar o preparo, dá baixa no estoque conforme a ficha técnica de cada item
    if (status === "Preparando" && cur.rows[0].status !== "Preparando") {
      const items = await client.query(
        "select product_id,quantity from order_items where order_id=$1",
        [req.params.id]
      );
      for (const item of items.rows) {
        const recipe = await client.query(
          "select ingredient_id,quantity from recipes where product_id=$1",
          [item.product_id]
        );
        for (const r of recipe.rows) {
          const used = Number(r.quantity) * item.quantity;
          await client.query("update ingredients set stock_qty=stock_qty-$1 where id=$2", [used, r.ingredient_id]);
          await client.query(
            `insert into stock_movements(ingredient_id,movement_type,quantity,reason,order_id)
             values($1,'Saída',$2,$3,$4)`,
            [r.ingredient_id, used, `Baixa automática - pedido #${req.params.id}`, req.params.id]
          );
        }
      }
    }

    const upd = await client.query(
      "update orders set status=$1,updated_at=now() where id=$2 returning id,status",
      [status, req.params.id]
    );
    await client.query(
      "insert into order_status_history(order_id,status,changed_by) values($1,$2,$3)",
      [req.params.id, status, req.user.id]
    );

    await client.query("commit");
    res.json(upd.rows[0]);
  } catch (e) {
    await client.query("rollback");
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

router.delete("/:id", requireRole("admin"), async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  const client = await pool.connect();
  try {
    await client.query("begin");

    // Devolve ao estoque qualquer ingrediente que tenha sido baixado por esse pedido
    await client.query(
      `update ingredients i set stock_qty = stock_qty + sub.total
       from (select ingredient_id, sum(quantity) as total from stock_movements where order_id=$1 group by ingredient_id) sub
       where i.id = sub.ingredient_id`,
      [req.params.id]
    );
    await client.query("delete from stock_movements where order_id=$1", [req.params.id]);
    await client.query("delete from finance_entries where order_id=$1", [req.params.id]);
    const del = await client.query("delete from orders where id=$1 returning id", [req.params.id]);
    if (!del.rows[0]) throw new Error("Pedido não encontrado");

    await client.query("commit");
    res.json({ deleted: true });
  } catch (e) {
    await client.query("rollback");
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

export default router;
