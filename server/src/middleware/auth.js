import jwt from "jsonwebtoken";

export const JWT_SECRET = process.env.JWT_SECRET || "TROQUE-ESTE-SEGREDO-EM-PRODUCAO";

if (!process.env.JWT_SECRET) {
  console.warn("[aviso] JWT_SECRET não definido — usando valor padrão inseguro. Configure antes de publicar.");
}

export function auth(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Não autorizado" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Sessão inválida ou expirada" });
  }
}

// Restringe uma rota a papéis específicos: admin, cozinha, atendimento
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Sem permissão para esta ação" });
    }
    next();
  };
}
