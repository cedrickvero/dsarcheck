-- 0029: users actor-lookup policy
--
-- The session resolve path (resolveSession) reads the user row after setting the
-- workspace GUC to the session's workspace. That works only while a session's
-- workspace equals the user's home workspace — the single-workspace model. To let a
-- session SWITCH its active workspace (the multi-workspace switcher), the user read
-- must not depend on app.workspace_id. This additive SELECT policy lets resolveSession
-- read the user by the actor's own id (app.actor_id), which is set only from a
-- token-hash-verified session row, so it exposes nothing an unauthenticated caller can
-- reach. The existing workspace-scoped policy is untouched.

CREATE POLICY users_actor_lookup ON "users" FOR SELECT
  USING ("id" = (NULLIF(current_setting('app.actor_id', true), ''))::uuid);
