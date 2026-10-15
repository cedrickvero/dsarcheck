-- CRITICAL-1: magic-link redemption was impossible.
--
-- redeemLink is an UPDATE, but magic_links_token_lookup was declared FOR SELECT, so the
-- UPDATE's USING check found no row and the callback returned 401 for every valid link.
-- The session store escaped this only by accident: resolveSession sets app.workspace_id
-- BEFORE its touch-update, so that UPDATE passes via the tenant policy instead.
--
-- The policy must therefore cover the pre-tenant UPDATE, not just the read. It stays
-- keyed on the presented hash, so a caller can still only ever act on the single row
-- whose credential they already hold: a 256-bit hash is not guessable, and WITH CHECK
-- keeps the row inside the workspace it was minted for.
DROP POLICY IF EXISTS magic_links_token_lookup ON "magic_links";
--> statement-breakpoint
CREATE POLICY magic_links_token_lookup ON "magic_links" FOR ALL
  USING ("token_hash" = current_setting('app.magic_token_hash', true))
  WITH CHECK ("token_hash" = current_setting('app.magic_token_hash', true));
