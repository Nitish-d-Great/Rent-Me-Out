import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Gate for anything that spends the registrar key or reads private application data.
 *
 * The caller sends REGISTRAR_ACCESS_TOKEN in x-registrar-token. With no token configured
 * this is open in development and closed in production, so forgetting the setting can
 * never expose a deployed site.
 */
export function isRegistrar(request: Request): boolean {
  const expected = process.env.REGISTRAR_ACCESS_TOKEN;
  if (!expected) return process.env.NODE_ENV !== "production";
  const given = Buffer.from(request.headers.get("x-registrar-token") ?? "");
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}
