// Responses ⇄ Chat Completions translation (pure). Owner: A8. Served by electron/main/bridge-server.ts on 127.0.0.1.
// Spike (c): Codex 0.166 refuses wire_api = "chat", so every chat-only vendor (DeepSeek, Kimi, Qwen, MiniMax, 混元)
// goes through this. Must support streaming text and tool calls (function_call ⇄ tool_calls) (R-01).
//
// Request:  instructions + system/developer messages → one leading system message (some vendors reject a second one);
//           message / function_call / function_call_output / custom_tool_call(_output) / reasoning items → messages;
//           function tools pass through, custom (freeform) tools become a function with one string argument "input",
//           other built-in tool types (web_search, local_shell, …) are dropped: chat vendors cannot run them.
// Response: Chat SSE chunks → response.created, then reasoning / message / tool-call items, then response.completed.
type Obj = Record<string, unknown>;
type Msg = Obj & { role: string };
type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Text of a Responses content value: a string, or an array of input_text / output_text / text parts */
function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter(isObj).map(p => str(p.text)).filter(Boolean).join('\n');
}

/** Chat content for a user / assistant message: a plain string unless it carries images */
function chatContent(content: unknown): unknown {
  if (!Array.isArray(content) || !content.some(p => isObj(p) && p.type === 'input_image')) return textOf(content);
  return content.filter(isObj).flatMap((p): Obj[] => {
    if (p.type === 'input_image') return [{ type: 'image_url', image_url: { url: str(p.image_url) } }];
    return p.text ? [{ type: 'text', text: str(p.text) }] : [];
  });
}

/** Names of the custom (freeform) tools in a Responses request; their calls go back as custom_tool_call items */
export function customToolNames(body: Obj): string[] {
  const tools = Array.isArray(body.tools) ? body.tools : [];
  return tools.filter(isObj).filter(t => t.type === 'custom').map(t => str(t.name));
}

function chatTools(tools: unknown): Obj[] {
  if (!Array.isArray(tools)) return [];
  return tools.filter(isObj).flatMap(t => {
    if (t.type === 'function') {
      return [{ type: 'function', function: { name: t.name, description: str(t.description), parameters: t.parameters ?? { type: 'object', properties: {} } } }];
    }
    if (t.type === 'custom') {
      const format = isObj(t.format) && t.format.definition ? `\n\n输入格式：\n${str(t.format.definition)}` : '';
      return [{
        type: 'function',
        function: {
          name: t.name,
          description: str(t.description) + format,
          parameters: { type: 'object', properties: { input: { type: 'string', description: 'The raw input for this tool' } }, required: ['input'] },
        },
      }];
    }
    return [];
  });
}

/** A Responses API request body (what Codex sends) → a Chat Completions request body */
export function responsesToChat(body: Obj, model: string): Obj {
  const system: string[] = [];
  if (str(body.instructions)) system.push(str(body.instructions));
  const messages: Msg[] = [];
  let pendingReasoning = '';
  const assistant = (): Msg => {
    const last = messages[messages.length - 1];
    if (last?.role === 'assistant') return last;
    const created: Msg = { role: 'assistant', content: null };
    messages.push(created);
    return created;
  };
  const addCall = (call: ToolCall) => {
    const msg = assistant();
    ((msg.tool_calls ??= []) as ToolCall[]).push(call);
    if (pendingReasoning) { msg.reasoning_content = pendingReasoning; pendingReasoning = ''; }
  };
  const input = typeof body.input === 'string' ? [{ type: 'message', role: 'user', content: body.input }] : Array.isArray(body.input) ? body.input : [];
  for (const item of input.filter(isObj)) {
    const type = item.type ?? 'message';
    if (type === 'message') {
      const role = str(item.role);
      if (role === 'system' || role === 'developer') { const t = textOf(item.content); if (t) system.push(t); continue; }
      if (role === 'assistant') {
        const text = textOf(item.content);
        const last = messages[messages.length - 1];
        if (last?.role === 'assistant' && !last.tool_calls) last.content = [str(last.content), text].filter(Boolean).join('\n');
        else messages.push({ role: 'assistant', content: text });
        continue;
      }
      messages.push({ role: 'user', content: chatContent(item.content) });
    } else if (type === 'function_call') {
      addCall({ id: str(item.call_id), type: 'function', function: { name: str(item.name), arguments: str(item.arguments) || '{}' } });
    } else if (type === 'custom_tool_call') {
      addCall({ id: str(item.call_id), type: 'function', function: { name: str(item.name), arguments: JSON.stringify({ input: str(item.input) }) } });
    } else if (type === 'function_call_output' || type === 'custom_tool_call_output') {
      const out = item.output;
      const content = typeof out === 'string' ? out : isObj(out) ? textOf(out.content) : textOf(out);
      messages.push({ role: 'tool', tool_call_id: str(item.call_id), content });
    } else if (type === 'reasoning') {
      // Thinking models (DeepSeek, Kimi) want their reasoning back only alongside the tool calls it led to
      pendingReasoning = textOf(item.content) || textOf(item.summary);
    }
  }
  const out: Obj = { model, messages: [...(system.length ? [{ role: 'system', content: system.join('\n\n') }] : []), ...messages], stream: true, stream_options: { include_usage: true } };
  const tools = chatTools(body.tools);
  if (tools.length) {
    out.tools = tools;
    const choice = body.tool_choice;
    if (typeof choice === 'string') out.tool_choice = choice;
    else if (isObj(choice) && choice.name) out.tool_choice = { type: 'function', function: { name: choice.name } };
    if (typeof body.parallel_tool_calls === 'boolean') out.parallel_tool_calls = body.parallel_tool_calls;
  }
  if (typeof body.max_output_tokens === 'number') out.max_tokens = body.max_output_tokens;
  if (typeof body.temperature === 'number') out.temperature = body.temperature;
  if (typeof body.top_p === 'number') out.top_p = body.top_p;
  const format = isObj(body.text) && isObj(body.text.format) ? body.text.format : null;
  if (format?.type === 'json_schema') {
    out.response_format = { type: 'json_schema', json_schema: { name: str(format.name) || 'output', schema: format.schema, strict: format.strict === true } };
  }
  return out;
}

/** A non-stream chat.completion body, reshaped as one stream chunk (some vendors ignore stream: true) */
export function completionToChunk(completion: Obj): Obj {
  const choices = Array.isArray(completion.choices) ? completion.choices.filter(isObj) : [];
  return { ...completion, choices: choices.map(c => ({ index: c.index, delta: c.message, finish_reason: c.finish_reason })) };
}

/** Incremental SSE parser: feed text, get each event's joined `data:` payload */
export function createSseParser(): { feed(text: string): string[]; flush(): string[] } {
  let buf = '';
  let data: string[] = [];
  const line = (l: string, out: string[]) => {
    if (l.endsWith('\r')) l = l.slice(0, -1);
    if (l === '') { if (data.length) out.push(data.join('\n')); data = []; return; }
    if (l.startsWith('data:')) data.push(l.slice(5).replace(/^ /, ''));
  };
  return {
    feed(text) {
      buf += text;
      const out: string[] = [];
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) { line(buf.slice(0, i), out); buf = buf.slice(i + 1); }
      return out;
    },
    flush() {
      const out: string[] = [];
      if (buf) line(buf, out);
      buf = '';
      line('', out);
      return out;
    },
  };
}

export interface StreamOptions {
  model?: string;
  /** Tools to answer as custom_tool_call (see customToolNames) */
  customTools?: string[];
  /** Seconds since epoch for response.created_at */
  createdAt?: number;
}

/** Incremental: feed Chat Completions SSE `data:` payloads, get Responses SSE events back */
export interface ChatStreamTranslator {
  push(chunk: Record<string, unknown>): Record<string, unknown>[];
  end(): Record<string, unknown>[];
}

export function createStreamTranslator(responseId: string, opts: StreamOptions = {}): ChatStreamTranslator {
  const custom = new Set(opts.customTools ?? []);
  const base = { id: responseId, object: 'response', created_at: opts.createdAt ?? Math.floor(Date.now() / 1000), model: opts.model ?? '' };
  const output: Obj[] = [];
  const calls: { id: string; name: string; args: string }[] = [];
  let usage: Obj | undefined;
  let started = false;
  let finished = false;
  let open: { kind: 'reasoning' | 'message'; id: string; text: string } | null = null;

  const start = (events: Obj[]) => {
    if (started) return;
    started = true;
    events.push({ type: 'response.created', response: { ...base, status: 'in_progress', output: [] } });
  };
  const close = (events: Obj[]) => {
    if (!open) return;
    const index = output.length;
    if (open.kind === 'message') {
      const part = { type: 'output_text', text: open.text, annotations: [] };
      events.push({ type: 'response.output_text.done', item_id: open.id, output_index: index, content_index: 0, text: open.text });
      events.push({ type: 'response.content_part.done', item_id: open.id, output_index: index, content_index: 0, part });
      output.push({ type: 'message', id: open.id, status: 'completed', role: 'assistant', content: [part] });
    } else {
      output.push({ type: 'reasoning', id: open.id, summary: [], content: [{ type: 'reasoning_text', text: open.text }] });
    }
    events.push({ type: 'response.output_item.done', output_index: index, item: output[index] });
    open = null;
  };
  const append = (kind: 'reasoning' | 'message', delta: string, events: Obj[]) => {
    if (open?.kind !== kind) {
      close(events);
      const id = `${kind === 'message' ? 'msg' : 'rs'}_${responseId}_${output.length}`;
      open = { kind, id, text: '' };
      const item = kind === 'message'
        ? { type: 'message', id, status: 'in_progress', role: 'assistant', content: [] }
        : { type: 'reasoning', id, summary: [], content: [] };
      events.push({ type: 'response.output_item.added', output_index: output.length, item });
      if (kind === 'message') events.push({ type: 'response.content_part.added', item_id: id, output_index: output.length, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } });
    }
    open.text += delta;
    const type = kind === 'message' ? 'response.output_text.delta' : 'response.reasoning_text.delta';
    events.push({ type, item_id: open.id, output_index: output.length, content_index: 0, delta });
  };

  return {
    push(chunk) {
      const events: Obj[] = [];
      if (finished) return events;
      start(events);
      if (isObj(chunk.error)) {
        finished = true;
        events.push({ type: 'response.failed', response: { ...base, status: 'failed', output, error: { code: str(chunk.error.code) || 'upstream_error', message: str(chunk.error.message) || '厂商返回了错误' } } });
        return events;
      }
      if (isObj(chunk.usage)) usage = chunk.usage;
      const choice = Array.isArray(chunk.choices) && isObj(chunk.choices[0]) ? chunk.choices[0] : null;
      const delta = choice && isObj(choice.delta) ? choice.delta : null;
      if (!delta) return events;
      const reasoning = str(delta.reasoning_content) || str(delta.reasoning);
      if (reasoning) append('reasoning', reasoning, events);
      if (str(delta.content)) append('message', str(delta.content), events);
      const toolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls.filter(isObj) : [];
      for (const tc of toolCalls) {
        // Some vendors omit index: match by id, else continue the last call
        let index = typeof tc.index === 'number' ? tc.index : str(tc.id) ? calls.findIndex(c => c?.id === tc.id) : calls.length - 1;
        if (index < 0) index = calls.length;
        const fn = isObj(tc.function) ? tc.function : {};
        const call = (calls[index] ??= { id: '', name: '', args: '' });
        if (str(tc.id)) call.id = str(tc.id);
        if (str(fn.name)) call.name = str(fn.name);
        call.args += str(fn.arguments);
      }
      return events;
    },
    end() {
      const events: Obj[] = [];
      if (finished) return events;
      finished = true;
      start(events);
      close(events);
      calls.filter(Boolean).forEach((call, n) => {
        const callId = call.id || `call_${responseId}_${n}`;
        const id = `fc_${responseId}_${output.length}`;
        let item: Obj;
        if (custom.has(call.name)) {
          let input = call.args;
          try { const parsed: unknown = JSON.parse(call.args); if (isObj(parsed) && typeof parsed.input === 'string') input = parsed.input; } catch { /* model sent raw text */ }
          item = { type: 'custom_tool_call', id, status: 'completed', call_id: callId, name: call.name, input };
        } else {
          item = { type: 'function_call', id, status: 'completed', call_id: callId, name: call.name, arguments: call.args || '{}' };
        }
        events.push({ type: 'response.output_item.added', output_index: output.length, item });
        events.push({ type: 'response.output_item.done', output_index: output.length, item });
        output.push(item);
      });
      const u = usage ?? {};
      const num = (v: unknown) => (typeof v === 'number' ? v : 0);
      const promptDetails = isObj(u.prompt_tokens_details) ? u.prompt_tokens_details : {};
      const completionDetails = isObj(u.completion_tokens_details) ? u.completion_tokens_details : {};
      events.push({
        type: 'response.completed',
        response: {
          ...base, status: 'completed', output,
          usage: {
            input_tokens: num(u.prompt_tokens),
            input_tokens_details: { cached_tokens: num(promptDetails.cached_tokens) || num(u.prompt_cache_hit_tokens) },
            output_tokens: num(u.completion_tokens),
            output_tokens_details: { reasoning_tokens: num(completionDetails.reasoning_tokens) },
            total_tokens: num(u.total_tokens) || num(u.prompt_tokens) + num(u.completion_tokens),
          },
        },
      });
      return events;
    },
  };
}
