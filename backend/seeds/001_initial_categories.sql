-- Khedmah Digital V1 initial categories seed

INSERT INTO categories
(code, name_ar, status, sort_order)
VALUES
('restaurant', 'مطاعم', 'active', 1)
ON CONFLICT (code) DO NOTHING;
