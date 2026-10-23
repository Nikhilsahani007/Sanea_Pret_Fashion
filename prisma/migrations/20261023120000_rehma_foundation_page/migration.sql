-- Phase 10: the Rehma Foundation page row (Q10-9, D-093; project-requirements.md
-- §8, D-010, OD-13). A DRAFT with a neutral placeholder; never published by the
-- system. Only the Owner can publish it, after verifying its content, and the
-- page CHECKs refuse publication without verification. No table changes.
-- Idempotent: an existing row (for example one created by staff) is unchanged.
INSERT INTO "page" ("slug", "title", "draft_body", "status", "requires_verification", "updated_at")
VALUES (
  'rehma-foundation',
  'Rehma Foundation',
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Information about the Rehma Foundation will be published here once it has been verified."}]}]}'::jsonb,
  'DRAFT',
  true,
  now()
)
ON CONFLICT ("slug") DO NOTHING;
