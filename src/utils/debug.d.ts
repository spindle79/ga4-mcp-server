declare module "./debug.js" {
  export function debugLog(
    level: "info" | "error" | "warn",
    message: string,
    data?: any
  ): void;
}
