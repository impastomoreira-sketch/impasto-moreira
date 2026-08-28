-- Impasto Moreira — Etapa 4: schema de produção
-- Rode este arquivo uma vez no banco PostgreSQL antes de iniciar a API.

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin','cozinha','atendimento')),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  email VARCHAR(160),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(name,phone)
);

CREATE TABLE IF NOT EXISTS addresses (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT REFERENCES customers(id) ON DELETE CASCADE,
  street VARCHAR(160) NOT NULL,
  number VARCHAR(20),
  complement VARCHAR(80),
  neighborhood VARCHAR(100) NOT NULL,
  city VARCHAR(100),
  state VARCHAR(2),
  zip VARCHAR(12),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery_zones (
  id BIGSERIAL PRIMARY KEY,
  neighborhood VARCHAR(100) NOT NULL UNIQUE,
  city VARCHAR(100),
  fee NUMERIC(10,2) NOT NULL,
  active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS categories (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  category_id BIGINT REFERENCES categories(id),
  description TEXT,
  price NUMERIC(10,2) NOT NULL,
  image_url TEXT,
  promo_price NUMERIC(10,2),
  promo_active BOOLEAN DEFAULT FALSE,
  active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS ingredients (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  stock_qty NUMERIC(12,3) DEFAULT 0,
  min_qty NUMERIC(12,3) DEFAULT 0,
  unit_cost NUMERIC(12,4) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS recipes (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT REFERENCES products(id) ON DELETE CASCADE,
  ingredient_id BIGINT REFERENCES ingredients(id),
  quantity NUMERIC(12,4) NOT NULL,
  UNIQUE(product_id,ingredient_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT REFERENCES customers(id),
  address_id BIGINT REFERENCES addresses(id),
  order_type VARCHAR(20) NOT NULL CHECK (order_type IN ('Delivery','Retirada')),
  status VARCHAR(30) NOT NULL DEFAULT 'Recebido',
  payment_method VARCHAR(30),
  subtotal NUMERIC(10,2) NOT NULL,
  delivery_fee NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES products(id),
  product_name VARCHAR(120) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL,
  changed_by BIGINT REFERENCES users(id),
  changed_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_entries (
  id BIGSERIAL PRIMARY KEY,
  entry_type VARCHAR(20) NOT NULL CHECK (entry_type IN ('Receita','Despesa')),
  description VARCHAR(200) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  order_id BIGINT REFERENCES orders(id),
  due_date DATE,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id BIGSERIAL PRIMARY KEY,
  ingredient_id BIGINT REFERENCES ingredients(id),
  movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN ('Entrada','Saída','Ajuste')),
  quantity NUMERIC(12,3) NOT NULL,
  unit_cost NUMERIC(12,4),
  reason VARCHAR(200),
  order_id BIGINT REFERENCES orders(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(60) PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_finance_created ON finance_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_ingredient ON stock_movements(ingredient_id);

-- ===== Dados iniciais (não sensíveis) =====

INSERT INTO categories(name,sort_order) VALUES
('Pizzas',1),('Doces',2),('Bebidas',3)
ON CONFLICT (name) DO NOTHING;

INSERT INTO products(name,category_id,description,price)
SELECT x.name, c.id, x.description, x.price FROM (VALUES
 ('Calabresa Speciale','Molho, mussarela, calabresa artesanal e cebola',59.90,'Pizzas'),
 ('Margherita','Molho, mussarela, tomate e manjericão',54.90,'Pizzas'),
 ('Lombo Canadense','Molho, mussarela e lombo canadense',62.90,'Pizzas'),
 ('Dolce Castagna','Chocolate, queijo coalho e castanhas',49.90,'Doces'),
 ('Coca-Cola 2L','Refrigerante 2 litros',12.00,'Bebidas'),
 ('Guaraná 2L','Refrigerante 2 litros',10.00,'Bebidas')
) AS x(name,description,price,category_name)
JOIN categories c ON c.name = x.category_name
WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.name = x.name);

INSERT INTO ingredients(name,unit,stock_qty,min_qty,unit_cost)
SELECT * FROM (VALUES
 ('Farinha','kg',18,5,5.80),
 ('Molho de tomate','kg',7,3,12.50),
 ('Mussarela','kg',5.2,3,42),
 ('Calabresa artesanal','kg',2.4,1.5,31),
 ('Queijo coalho','kg',1.4,1,39),
 ('Castanhas','kg',.7,.3,68),
 ('Chocolate','kg',2,1,26)
) AS x(name,unit,stock_qty,min_qty,unit_cost)
WHERE NOT EXISTS (SELECT 1 FROM ingredients i WHERE i.name = x.name);

INSERT INTO recipes(product_id,ingredient_id,quantity)
SELECT p.id,i.id,x.qty FROM (VALUES
 ('Calabresa Speciale','Farinha',0.28),('Calabresa Speciale','Molho de tomate',0.12),
 ('Calabresa Speciale','Mussarela',0.18),('Calabresa Speciale','Calabresa artesanal',0.12),
 ('Margherita','Farinha',0.28),('Margherita','Molho de tomate',0.12),('Margherita','Mussarela',0.20),
 ('Lombo Canadense','Farinha',0.28),('Lombo Canadense','Molho de tomate',0.10),('Lombo Canadense','Mussarela',0.18),
 ('Dolce Castagna','Chocolate',0.15),('Dolce Castagna','Queijo coalho',0.10),('Dolce Castagna','Castanhas',0.05)
) AS x(product_name,ingredient_name,qty)
JOIN products p ON p.name = x.product_name
JOIN ingredients i ON i.name = x.ingredient_name
ON CONFLICT (product_id,ingredient_id) DO UPDATE SET quantity = excluded.quantity;

INSERT INTO delivery_zones(neighborhood,city,fee) VALUES
('Centro','Sua Cidade',6.00),
('Jardim das Flores','Sua Cidade',9.00),
('Vila Nova','Sua Cidade',12.00),
('PADRÃO','Sua Cidade',10.00)
ON CONFLICT (neighborhood) DO NOTHING;

INSERT INTO settings(key,value) VALUES
('restaurant_name','Impasto Moreira'),
('whatsapp_number',''),
('menu_public_url',''),
('instagram_url','')
ON CONFLICT (key) DO NOTHING;

-- Ajuste os bairros e taxas de "delivery_zones" para a região real da pizzaria
-- antes de publicar. Nenhum usuário administrador é criado aqui — use
-- "npm run seed:admin" após configurar DATABASE_URL, por segurança.
-- Defina "whatsapp_number" (formato internacional, ex: 5511999998888) pelo
-- painel em Configurações para habilitar o botão "Pedir pelo WhatsApp".
