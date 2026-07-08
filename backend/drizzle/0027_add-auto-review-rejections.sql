-- Auto-review rejections: stores suggestions that users rejected so the LLM
-- can avoid repeating them on future reviews of the same document.
-- Idempotent (IF NOT EXISTS) so re-running the migrator on a database that
-- already has the table is a no-op; this also tolerates partial applies.
CREATE TABLE IF NOT EXISTS auto_review_rejections (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL,
  element_id TEXT NOT NULL,
  original_text TEXT NOT NULL,
  suggestion_text TEXT NOT NULL,
  category TEXT,
  message TEXT,
  rejected_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rejected_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auto_review_rejections_project ON auto_review_rejections(project_id);
CREATE INDEX IF NOT EXISTS idx_auto_review_rejections_document ON auto_review_rejections(document_id);
CREATE INDEX IF NOT EXISTS idx_auto_review_rejections_element ON auto_review_rejections(element_id);