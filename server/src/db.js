import pg from "pg";

const { Pool } = pg;

export const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === "false" ? false : { rejectUnauthorized: false },
      max: 10
    })
  : null;

if (!process.env.DATABASE_URL) {
  console.warn("[aviso] DATABASE_URL não definida — API responderá com dados vazios até o banco ser configurado.");
}
