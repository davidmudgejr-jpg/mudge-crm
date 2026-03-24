-- 028_fix_directives_scope.sql — Remove restrictive CHECK constraint on directives.scope
-- The old constraint only allowed a hardcoded list of agent names.
-- With the expanding agent system (Postmaster, Campaign Manager, Oracle, claude_code, etc.),
-- we need scope to accept any agent name freely.

ALTER TABLE directives DROP CONSTRAINT IF EXISTS directives_scope_check;
-- No replacement constraint — scope is now a free TEXT field.
-- Agent names are validated at the application layer, not the database layer.
