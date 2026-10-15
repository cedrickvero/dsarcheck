import { z, type ZodTypeAny } from "zod";
import { ValidationError } from "./errors";

/**
 * Validate a payload with Zod, converting failures into a typed 422.
 *
 * Every mutation validates before it reaches a service, and the mutation helper
 * shape stays authz -> validate -> transaction(change + audit event).
 *
 * Server-only: never import this into a client component.
 */
export function parseWith<T extends ZodTypeAny>(schema: T, payload: unknown): z.infer<T> {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new ValidationError(detail);
  }
  return result.data;
}
