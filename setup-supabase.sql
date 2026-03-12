-- =====================================================================
-- Dazu Beauty Shop - Supabase Setup SQL
-- Ejecuta este script en: Supabase Dashboard > SQL Editor > New query
-- =====================================================================

-- 1. Tabla de productos
CREATE TABLE products (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  category    TEXT DEFAULT '',
  price       NUMERIC NOT NULL,
  description TEXT DEFAULT '',
  available   BOOLEAN DEFAULT true,
  image_url   TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabla de configuracion
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 3. Insertar configuracion inicial
INSERT INTO settings (key, value) VALUES ('wa_number', '');

-- 4. Habilitar Row Level Security (RLS)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- 5. Politicas para productos
-- Cualquiera puede ver los productos (clientes)
CREATE POLICY "Anyone can view products"
  ON products FOR SELECT
  USING (true);

-- Solo usuarios autenticados pueden agregar productos (admin)
CREATE POLICY "Auth users can insert products"
  ON products FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Solo usuarios autenticados pueden editar productos
CREATE POLICY "Auth users can update products"
  ON products FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Solo usuarios autenticados pueden eliminar productos
CREATE POLICY "Auth users can delete products"
  ON products FOR DELETE
  USING (auth.role() = 'authenticated');

-- 6. Politicas para configuracion
-- Cualquiera puede leer la configuracion (para obtener el numero de WhatsApp)
CREATE POLICY "Anyone can view settings"
  ON settings FOR SELECT
  USING (true);

-- Solo usuarios autenticados pueden modificar configuracion
CREATE POLICY "Auth users can insert settings"
  ON settings FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Auth users can update settings"
  ON settings FOR UPDATE
  USING (auth.role() = 'authenticated');

-- 7. Crear bucket de Storage para imagenes (ejecutar por separado si falla)
-- NOTA: Esto se puede hacer tambien desde la UI de Supabase > Storage > New bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true);

-- 8. Politicas de Storage
-- Cualquiera puede ver las imagenes
CREATE POLICY "Public read access on product images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

-- Solo usuarios autenticados pueden subir imagenes
CREATE POLICY "Auth users can upload product images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'product-images' AND auth.role() = 'authenticated');

-- Solo usuarios autenticados pueden actualizar imagenes
CREATE POLICY "Auth users can update product images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'product-images' AND auth.role() = 'authenticated');

-- Solo usuarios autenticados pueden eliminar imagenes
CREATE POLICY "Auth users can delete product images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'product-images' AND auth.role() = 'authenticated');
