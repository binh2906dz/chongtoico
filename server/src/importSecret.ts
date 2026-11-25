/**
 * Secret header of the import script.
 *
 * The import of the old system writes thousands of articles in a row — the
 * rate limit of the browser would stop it. The header is only accepted with
 * the right secret, so a visitor cannot use it to lift the limit.
 *
 * Lives in its own file: `app.ts` and the routes both need it, and a
 * circular import would break the start of the server.
 */
export const IMPORT_HEADER = "x-import-secret";
export const IMPORT_SECRET = process.env.IMPORT_SECRET ?? "";

/** The request comes from the import script. */
export function isImportRequest(headers: Record<string, unknown>): boolean {
  return Boolean(IMPORT_SECRET) && headers[IMPORT_HEADER] === IMPORT_SECRET;
}
