-- BootstrapRoleData
-- Seed the base roles required by the RBAC design (registers must NOT auto-create roles).
INSERT INTO "Roles" ("id", "name", "createdAt", "updatedAt") VALUES
  ('clr_base_admin',    'ADMIN',    NOW(), NOW()),
  ('clr_base_moderator','MODERATOR',NOW(), NOW()),
  ('clr_base_user',     'USER',     NOW(), NOW())
ON CONFLICT ("name") DO NOTHING;