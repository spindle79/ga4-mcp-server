export function debugLog(message) {
  if (process.env.DEBUG) {
    console.log(`[DEBUG] ${message}`);
  }
}
