import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";

import { pool } from "./src/db.js";
import { auth, requireRole } from "./src/middleware/auth.js";
import authRoutes from "./src/routes/authRoutes.js";
import publicRoutes from "./src/routes/publicRoutes.js";
import productRoutes from "./src/routes/productRoutes.js";
import orderRoutes from "./src/routes/orderRoutes.js";
import stockRoutes from "./src/routes/stockRoutes.js";
import financeRoutes from "./src/routes/financeRoutes.js";
import reportRoutes from "./src/routes/reportRoutes.js";
import userRoutes from "./src/routes/userRoutes.js";
import settingsRoutes from "./src/routes/settingsRoutes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json({ limit: "1mb" }));

// Limite geral da API
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));

// Limite mais rígido para criação de pedidos (evita spam/abuso do checkout público)
app.use(
  "/api/public/orders",
  rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 20,
    message: { error: "Muitos pedidos em pouco tempo. Tente novamente em instantes." }
  })
);

// Limite rígido no login (proteção contra força bruta)
app.use(
  "/api/auth/login",
  rateLimit({ windowMs: 15 * 60 * 1000, max: 15, message: { error: "Muitas tentativas de login. Aguarde alguns minutos." } })
);

app.use(express.static(path.join(__dirname, "../public")));

app.get("/api/health", async (_, res) => {
  if (!pool) return res.json({ ok: true, database: "não configurado" });
  try {
    await pool.query("select 1");
    res.json({ ok: true, database: "online" });
  } catch (e) {
    res.status(500).json({ ok: false, database: "offline", error: e.message });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/admin/products", auth, productRoutes);
app.use("/api/admin/orders", auth, orderRoutes);
app.use("/api/admin/stock", auth, requireRole("admin"), stockRoutes);
app.use("/api/admin/finance", auth, requireRole("admin"), financeRoutes);
app.use("/api/admin/reports", auth, requireRole("admin"), reportRoutes);
app.use("/api/admin/users", auth, requireRole("admin"), userRoutes);
app.use("/api/admin/settings", auth, requireRole("admin"), settingsRoutes);

// Placeholders documentados para a próxima etapa (PIX, WhatsApp, impressão, tempo real)
app.use("/api/integrations", (req, res) => {
  res.status(501).json({ error: "Integração ainda não configurada nesta etapa. Veja README.md." });
});

app.use("/admin", (req, res) => res.sendFile(path.join(__dirname, "../public/admin/index.html")));
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(__dirname, "../public/cardapio/index.html"));
});

app.use((req, res) => res.status(404).json({ error: "Rota não encontrada" }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Erro interno do servidor" });
});

app.listen(PORT, () => console.log(`Impasto Moreira rodando na porta ${PORT}`));
