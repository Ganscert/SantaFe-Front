-- 005_usuarios_pagado.sql
-- Tabla de usuarios y columna pagado_en en comensales

CREATE TABLE IF NOT EXISTS public.usuarios (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid        REFERENCES public.restaurantes(id),
  nombre         text        NOT NULL,
  email          text        NOT NULL UNIQUE,
  password_hash  text        NOT NULL,
  role           text        NOT NULL DEFAULT 'cliente',
  activo         boolean     NOT NULL DEFAULT true,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.usuarios (id, restaurante_id, nombre, email, password_hash, role) VALUES
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Admin Demo',     'admin@santafe.pe',     'demo1234', 'admin'),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Gerente Demo',   'gerente@santafe.pe',   'demo1234', 'gerente'),
  ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Recepción Demo', 'recepcion@santafe.pe', 'demo1234', 'recepcionista'),
  ('a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Mesero Demo',    'mesero@santafe.pe',    'demo1234', 'mesero'),
  ('a0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Cocinero Demo',  'cocinero@santafe.pe',  'demo1234', 'cocinero'),
  ('a0000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'Cajero Demo',    'cajero@santafe.pe',    'demo1234', 'cajero'),
  ('a0000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'Cliente Demo',   'cliente@santafe.pe',   'demo1234', 'cliente')
ON CONFLICT (email) DO NOTHING;

ALTER TABLE public.comensales ADD COLUMN IF NOT EXISTS pagado_en timestamptz;

CREATE INDEX IF NOT EXISTS usuarios_email_idx ON public.usuarios(email);
CREATE INDEX IF NOT EXISTS comensales_mesa_pagado_idx ON public.comensales(mesa_id) WHERE pagado_en IS NOT NULL;
