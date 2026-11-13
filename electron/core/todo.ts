// Placeholder marker used by Base's stubs. Each stub names the agent that replaces it. The integration agent's
// check: `grep -rn "todo(" electron ui` must be empty before delivery.
export function todo(owner: string, what: string): never {
  throw new Error(`not implemented yet (${owner}): ${what}`);
}
