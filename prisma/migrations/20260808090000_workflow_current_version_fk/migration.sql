-- Makes `workflows.current_version_id` a real foreign key, so Prisma can expose
-- it as the `currentVersion` relation and join the row in one query instead of
-- callers resolving the id themselves.
--
-- ON DELETE SET NULL: deleting the version a workflow currently points at must
-- not delete the workflow. It leaves the workflow with no current version,
-- which is the same state a pre-versioning row is already in.
--
-- Note this closes a cycle — workflow_versions.workflow_id already references
-- workflows.id — so a workflow row can no longer be inserted with its
-- current_version_id already set. The create path inserts the workflow, then
-- the version, then updates the pointer, all in one transaction.
ALTER TABLE "workflows"
  ADD CONSTRAINT "workflows_current_version_id_fkey"
  FOREIGN KEY ("current_version_id") REFERENCES "workflow_versions"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE INDEX IF NOT EXISTS "idx_workflows_current_version" ON "workflows" ("current_version_id");
