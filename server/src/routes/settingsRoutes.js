import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

export const SETTINGS_KEYS = ["restaurant_name", "whatsapp_number", "menu_public_url", "instagram_url", "target_markup_percent"];
const FIELD_TO_KEY = {
  restaurantName: "restaurant_name",
  whatsappNumber: "whatsapp_number",
  menuPublicUrl: "menu_public_url",
  instagramUrl: "instagram_url",
  targetMarkupPercent: "target_markup_percent"
};

export async function readSettings() {
  if (!pool) return {};
  const { rows } = await pool.query("select key,value from settings where key = any($1)", [SETTINGS_KEYS]);
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

function toPublicShape(s) {
  return {
    restaurantName: s.restaurant_name || "",
    whatsappNumber: s.whatsapp_number || "",
    menuPublicUrl: s.menu_public_url || "",
    instagramUrl: s.instagram_url || "",
    targetMarkupPercent: s.target_markup_percent || "230"
  };
}

// GET/PATCH aqui são sempre montados atrás de auth + requireRole("admin") no server.js
router.get("/", async (_, res) => {
  res.json(toPublicShape(await readSettings()));
});

router.patch("/", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Banco de dados não configurado" });
  const updates = req.body || {};
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const [field, key] of Object.entries(FIELD_TO_KEY)) {
      if (updates[field] !== undefined) {
        await client.query(
          `insert into settings(key,value) values($1,$2)
           on conflict (key) do update set value=excluded.value`,
          [key, String(updates[field])]
        );
      }
    }
    await client.query("commit");
    res.json(toPublicShape(await readSettings()));
  } catch (e) {
    await client.query("rollback");
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

export default router;
