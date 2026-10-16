/**
 * The only place the app is allowed to write to the console.
 *
 * Everything that goes out is redacted first (tokens, keys, emails, phone
 * numbers), and nothing but warnings and errors is emitted in production —
 * `next.config.ts` strips the rest of the console calls at build time.
 */
import { redactRecord, redactSensitive } from "./security";

function emit(
  sink: (...args: unknown[]) => void,
  message: string,
  context?: Record<string, unknown>,
): void {
  const line = `[sktapri] ${redactSensitive(message)}`;
  if (context) sink(line, redactRecord(context));
  else sink(line);
}

export function logWarn(message: string, context?: Record<string, unknown>): void {
  emit(console.warn, message, context);
}

export function logError(message: string, context?: Record<string, unknown>): void {
  emit(console.error, message, context);
}
