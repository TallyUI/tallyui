// An RxError's message carries its parameters, which can hold a payload with the approval proof (ADR-082 d2).

/** Renders an error for logging without RxDB parameters. */
export function safeErrorString(error: unknown): string {
  return (error as { rxdb?: unknown })?.rxdb === true ? (error as Error).name : String(error);
}

/** Renders an error message without RxDB parameters. */
export function safeErrorMessage(error: unknown): string {
  return (error as { rxdb?: unknown })?.rxdb === true ? (error as Error).name : error instanceof Error ? error.message : String(error);
}
