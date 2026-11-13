// Responses ⇄ Chat Completions translation (pure). Owner: A8. Served by electron/main/bridge-server.ts on 127.0.0.1.
// Spike (c): Codex 0.166 refuses wire_api = "chat", so every chat-only vendor (DeepSeek, Kimi, Qwen, MiniMax, 混元)
// goes through this. Must support streaming text and tool calls (function_call ⇄ tool_calls) (R-01).
import { todo } from '../todo';

/** A Responses API request body (what Codex sends) → a Chat Completions request body */
export function responsesToChat(_body: Record<string, unknown>, _model: string): Record<string, unknown> {
  return todo('A8', 'responsesToChat');
}

/** Incremental: feed Chat Completions SSE `data:` payloads, get Responses SSE events back */
export interface ChatStreamTranslator {
  push(chunk: Record<string, unknown>): Record<string, unknown>[];
  end(): Record<string, unknown>[];
}

export function createStreamTranslator(_responseId: string): ChatStreamTranslator {
  return todo('A8', 'createStreamTranslator');
}
