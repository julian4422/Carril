-- Datos demo de Carril. Idempotente (UUIDs fijos + ON CONFLICT DO NOTHING).
-- Nota: las UNIQUE de posición son DEFERRABLE y no admiten ON CONFLICT genérico; se usa (id) como arbitro.
-- Usuario: demo@carril.dev / demo1234
BEGIN;

INSERT INTO users (id, email, full_name, password_hash) VALUES
  ('00000000-0000-4000-8000-000000000001', 'demo@carril.dev', 'Usuario Demo',
   '$2b$12$5Jytj4Xbn63UZ2doQWGUve.08..sOzJyLn3M/hGdpQtznEs1jfDk2')
ON CONFLICT DO NOTHING;

INSERT INTO boards (id, owner_id, name, description, color) VALUES
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001',
   'Lanzamiento v1', 'Tareas para el lanzamiento de la primera versión de Carril.', '#0f6e63')
ON CONFLICT (id) DO NOTHING;

INSERT INTO board_columns (id, board_id, name, position) VALUES
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1', 'Por hacer', 0),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000b1', 'En curso',  1),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000b1', 'Hecho',     2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO labels (id, board_id, name, color) VALUES
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', 'Backend',  '#2563eb'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000b1', 'Frontend', '#d97706'),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000b1', 'Diseño',   '#9333ea')
ON CONFLICT (id) DO NOTHING;

INSERT INTO tasks (id, column_id, title, description, priority, due_date, position, assignee_id, created_by) VALUES
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1',
   'Redactar notas de la versión', 'Resumen de novedades y problemas conocidos para el anuncio.',
   'low', current_date + 14, 0, NULL, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c1',
   'Configurar monitoreo y alertas', 'Métricas de latencia y errores de la API con alertas por correo.',
   'high', current_date + 7, 1, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000c1',
   'Revisar accesibilidad del tablero', 'Contraste, foco de teclado y etiquetas ARIA en las tarjetas.',
   'medium', current_date + 10, 2, NULL, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000c2',
   'Implementar arrastrar y soltar de tareas', 'Mover tarjetas entre columnas y reordenarlas con persistencia.',
   'urgent', current_date + 3, 0, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000d5', '00000000-0000-4000-8000-0000000000c2',
   'Pruebas de carga de la API', 'Simular 200 usuarios concurrentes sobre los endpoints de tableros.',
   'high', current_date + 5, 1, NULL, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000d6', '00000000-0000-4000-8000-0000000000c2',
   'Pulir pantalla de inicio de sesión', NULL,
   'medium', NULL, 2, NULL, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000d7', '00000000-0000-4000-8000-0000000000c3',
   'Diseñar el esquema de base de datos', 'Tablas, restricciones, índices y triggers definidos en el contrato.',
   'high', current_date - 6, 0, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000d8', '00000000-0000-4000-8000-0000000000c3',
   'Definir identidad visual', 'Paleta, tipografías y logotipo de Carril.',
   'medium', current_date - 10, 1, NULL, '00000000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO task_labels (task_id, label_id) VALUES
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000a2'),
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000a2'),
  ('00000000-0000-4000-8000-0000000000d5', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000d6', '00000000-0000-4000-8000-0000000000a3'),
  ('00000000-0000-4000-8000-0000000000d7', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000d8', '00000000-0000-4000-8000-0000000000a3')
ON CONFLICT (task_id, label_id) DO NOTHING;

INSERT INTO task_comments (id, task_id, author_id, body) VALUES
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000d4',
   '00000000-0000-4000-8000-000000000001', 'Ya funciona entre columnas; falta reordenar dentro de la misma.'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000d4',
   '00000000-0000-4000-8000-000000000001', 'Ojo con las posiciones: hay que actualizarlas en una sola transacción.'),
  ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000d5',
   '00000000-0000-4000-8000-000000000001', 'Usaré k6 con un escenario de 5 minutos.'),
  ('00000000-0000-4000-8000-0000000000e4', '00000000-0000-4000-8000-0000000000d7',
   '00000000-0000-4000-8000-000000000001', 'Esquema aprobado y aplicado en ambas bases de datos.')
ON CONFLICT (id) DO NOTHING;

COMMIT;
