// Cria ou atualiza o usuário administrador a partir de variáveis de ambiente.
// Uso: ADMIN_NAME="Seu Nome" ADMIN_EMAIL="voce@dominio.com" ADMIN_PASSWORD="senha-forte" npm run seed:admin
import bcrypt from "bcryptjs";
import { pool } from "../src/db.js";

const name = process.env.ADMIN_NAME || "Administrador";
const email = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
const password = process.env.ADMIN_PASSWORD || "";

if (!email || !password) {
  console.error("Defina ADMIN_EMAIL e ADMIN_PASSWORD antes de rodar este script.");
  process.exit(1);
}
if (password.length < 6) {
  console.error("ADMIN_PASSWORD deve ter ao menos 6 caracteres.");
  process.exit(1);
}
if (!pool) {
  console.error("DATABASE_URL não configurada.");
  process.exit(1);
}

const hash = await bcrypt.hash(password, 10);
await pool.query(
  `insert into users(name,email,password_hash,role,active) values($1,$2,$3,'admin',true)
   on conflict (email) do update set password_hash=excluded.password_hash, role='admin', active=true, name=excluded.name`,
  [name, email, hash]
);
console.log(`Administrador "${email}" criado/atualizado com sucesso.`);
process.exit(0);
