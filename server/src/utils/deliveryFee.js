import { pool } from "../db.js";

// Busca a taxa de entrega cadastrada para o bairro; usa a zona PADRÃO como fallback.
export async function getDeliveryFee(neighborhood) {
  if (!pool) return 0;
  if (neighborhood) {
    const { rows } = await pool.query(
      "select fee from delivery_zones where lower(neighborhood)=lower($1) and active=true limit 1",
      [neighborhood]
    );
    if (rows[0]) return Number(rows[0].fee);
  }
  const def = await pool.query(
    "select fee from delivery_zones where neighborhood='PADRÃO' and active=true limit 1"
  );
  return def.rows[0] ? Number(def.rows[0].fee) : 10;
}
