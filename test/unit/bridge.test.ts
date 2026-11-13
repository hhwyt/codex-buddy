// L1 (R-01): Responses ⇄ Chat Completions translation, pure.
import { describe, expect, test } from 'vitest';
import { completionToChunk, createSseParser, createStreamTranslator, customToolNames, responsesToChat } from '../../electron/core/bridge';

type Any = any;

describe('responsesToChat', () => {
  test('R-01 指令和 developer 消息合成开头一条 system，用户和助手消息按顺序', () => {
    const out: Any = responsesToChat({
      model: 'x', instructions: '你是助手',
      input: [
        { type: 'message', role: 'developer', content: [{ type: 'input_text', text: '权限说明' }] },
        { role: 'system', content: '系统' },
        { type: 'message', role: 'developer', content: [] },
        { type: 'message', role: 'user', content: [{ type: 'input_text', text: '你好' }, { type: 'input_text', text: '在吗' }] },
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '在' }] },
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '请说' }] },
        'junk',
      ],
    }, 'deepseek-chat');
    expect(out.model).toBe('deepseek-chat');
    expect(out.stream).toBe(true);
    expect(out.stream_options).toEqual({ include_usage: true });
    expect(out.messages).toEqual([
      { role: 'system', content: '你是助手\n\n权限说明\n\n系统' },
      { role: 'user', content: '你好\n在吗' },
      { role: 'assistant', content: '在\n请说' },
    ]);
    expect(out.tools).toBeUndefined();
  });

  test('R-01 input 是字符串时当作一条用户消息，没有指令就不加 system', () => {
    expect((responsesToChat({ input: '嗨' }, 'm') as Any).messages).toEqual([{ role: 'user', content: '嗨' }]);
    expect((responsesToChat({}, 'm') as Any).messages).toEqual([]);
  });

  test('R-01 带图片的用户消息转成多段内容', () => {
    const out: Any = responsesToChat({ input: [{ role: 'user', content: [{ type: 'input_text', text: '看图' }, { type: 'input_image', image_url: 'data:image/png;base64,AA' }, { type: 'input_image' }, { type: 'other' }] }] }, 'm');
    expect(out.messages[0].content).toEqual([
      { type: 'text', text: '看图' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AA' } },
      { type: 'image_url', image_url: { url: '' } },
    ]);
    expect((responsesToChat({ input: [{ role: 'user', content: 5 }] }, 'm') as Any).messages[0].content).toBe('');
  });

  test('R-01 多轮工具调用：function_call 挂在助手消息上，结果变成 tool 消息', () => {
    const out: Any = responsesToChat({
      input: [
        { type: 'message', role: 'user', content: '跑一下' },
        { type: 'reasoning', id: 'rs1', summary: [], content: [{ type: 'reasoning_text', text: '想一想' }] },
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '好的' }] },
        { type: 'function_call', call_id: 'c1', name: 'exec_command', arguments: '{"cmd":"ls"}' },
        { type: 'function_call', call_id: 'c2', name: 'exec_command' },
        { type: 'function_call_output', call_id: 'c1', output: 'a.txt' },
        { type: 'function_call_output', call_id: 'c2', output: [{ type: 'input_text', text: 'b' }] },
        { type: 'reasoning', summary: [{ type: 'summary_text', text: '摘要' }] },
        { type: 'custom_tool_call', call_id: 'c3', name: 'apply_patch', input: '*** Begin Patch' },
        { type: 'custom_tool_call_output', call_id: 'c3', output: { content: [{ type: 'input_text', text: 'done' }] } },
        { type: 'function_call_output', call_id: 'c4', output: 7 },
        { type: 'message', role: 'assistant', content: '完成' },
      ],
    }, 'm');
    expect(out.messages).toEqual([
      { role: 'user', content: '跑一下' },
      {
        role: 'assistant', content: '好的', reasoning_content: '想一想',
        tool_calls: [
          { id: 'c1', type: 'function', function: { name: 'exec_command', arguments: '{"cmd":"ls"}' } },
          { id: 'c2', type: 'function', function: { name: 'exec_command', arguments: '{}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'c1', content: 'a.txt' },
      { role: 'tool', tool_call_id: 'c2', content: 'b' },
      { role: 'assistant', content: null, reasoning_content: '摘要', tool_calls: [{ id: 'c3', type: 'function', function: { name: 'apply_patch', arguments: '{"input":"*** Begin Patch"}' } }] },
      { role: 'tool', tool_call_id: 'c3', content: 'done' },
      { role: 'tool', tool_call_id: 'c4', content: '' },
      { role: 'assistant', content: '完成' },
    ]);
  });

  test('R-01 助手消息跟在工具调用后面时另起一条', () => {
    const out: Any = responsesToChat({ input: [
      { type: 'function_call', call_id: 'c1', name: 'f', arguments: '{}' },
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '' }] },
    ] }, 'm');
    expect(out.messages).toHaveLength(2);
    expect(out.messages[1]).toEqual({ role: 'assistant', content: '' });
  });

  test('R-01 工具：function 原样，custom 变成一个 input 参数，内置工具丢掉，tool_choice 和参数照转', () => {
    const body = {
      tools: [
        { type: 'function', name: 'exec_command', description: '执行', parameters: { type: 'object', properties: { cmd: { type: 'string' } } }, strict: false },
        { type: 'function', name: 'bare' },
        { type: 'custom', name: 'apply_patch', description: '打补丁', format: { type: 'grammar', definition: 'start: x' } },
        { type: 'custom', name: 'free' },
        { type: 'web_search' },
        'junk',
      ],
      tool_choice: 'auto', parallel_tool_calls: false, max_output_tokens: 100, temperature: 0.2, top_p: 0.9,
      text: { format: { type: 'json_schema', name: 'o', schema: { type: 'object' }, strict: true } },
    };
    const out: Any = responsesToChat(body, 'm');
    expect(out.tools.map((t: Any) => t.function.name)).toEqual(['exec_command', 'bare', 'apply_patch', 'free']);
    expect(out.tools[0].function).toEqual({ name: 'exec_command', description: '执行', parameters: body.tools[0] && (body.tools[0] as Any).parameters });
    expect(out.tools[1].function.parameters).toEqual({ type: 'object', properties: {} });
    expect(out.tools[2].function.description).toBe('打补丁\n\n输入格式：\nstart: x');
    expect(out.tools[2].function.parameters.required).toEqual(['input']);
    expect(out.tools[3].function.description).toBe('');
    expect(out.tool_choice).toBe('auto');
    expect(out.parallel_tool_calls).toBe(false);
    expect(out.max_tokens).toBe(100);
    expect(out.temperature).toBe(0.2);
    expect(out.top_p).toBe(0.9);
    expect(out.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'o', schema: { type: 'object' }, strict: true } });
    expect(customToolNames(body)).toEqual(['apply_patch', 'free']);
    expect(customToolNames({})).toEqual([]);
  });

  test('R-01 指定工具的 tool_choice 转成 Chat 的写法，只有内置工具时不带 tools', () => {
    const out: Any = responsesToChat({ tools: [{ type: 'function', name: 'f' }], tool_choice: { type: 'function', name: 'f' }, text: { format: { type: 'json_schema' } } }, 'm');
    expect(out.tool_choice).toEqual({ type: 'function', function: { name: 'f' } });
    expect(out.response_format.json_schema).toMatchObject({ name: 'output', strict: false });
    const none: Any = responsesToChat({ tools: [{ type: 'web_search' }], tool_choice: 'auto', text: { format: { type: 'text' } } }, 'm');
    expect(none.tools).toBeUndefined();
    expect(none.tool_choice).toBeUndefined();
    expect(none.response_format).toBeUndefined();
    expect((responsesToChat({ tools: [{ type: 'function', name: 'f' }], tool_choice: { type: 'auto' } }, 'm') as Any).tool_choice).toBeUndefined();
  });
});

describe('createSseParser', () => {
  test('R-01 跨块拼接、多行 data、CRLF、注释行、结尾没有空行', () => {
    const p = createSseParser();
    expect(p.feed('data: {"a"')).toEqual([]);
    expect(p.feed(':1}\n\n: keep-alive\n\nevent: x\r\ndata:b\r\ndata: c\r\n\r\ndata: [DONE]')).toEqual(['{"a":1}', 'b\nc']);
    expect(p.flush()).toEqual(['[DONE]']);
    expect(p.flush()).toEqual([]);
  });
});

describe('completionToChunk', () => {
  test('R-01 不流式的回复改成一个流式块', () => {
    expect(completionToChunk({ id: 'c', choices: [{ index: 0, message: { content: 'hi' }, finish_reason: 'stop' }], usage: { total_tokens: 1 } })).toEqual(
      { id: 'c', choices: [{ index: 0, delta: { content: 'hi' }, finish_reason: 'stop' }], usage: { total_tokens: 1 } });
    expect(completionToChunk({}).choices).toEqual([]);
  });
});

const tr = (id: string, opts?: Any): Any => createStreamTranslator(id, opts);
const types = (events: Any[]) => events.map(e => e.type);

describe('createStreamTranslator', () => {
  test('R-01 流式文字：created、增量、done、completed 带用量', () => {
    const t = tr('r1', { model: 'deepseek-chat', createdAt: 1 });
    const a = t.push({ choices: [{ index: 0, delta: { role: 'assistant', content: '你' } }] });
    expect(types(a)).toEqual(['response.created', 'response.output_item.added', 'response.content_part.added', 'response.output_text.delta']);
    expect(a[0].response).toMatchObject({ id: 'r1', created_at: 1, model: 'deepseek-chat', status: 'in_progress' });
    expect(types(t.push({ choices: [{ index: 0, delta: { content: '好' }, finish_reason: 'stop' }] }))).toEqual(['response.output_text.delta']);
    expect(t.push({ choices: [], usage: { prompt_tokens: 3, completion_tokens: 2, prompt_tokens_details: { cached_tokens: 1 }, completion_tokens_details: { reasoning_tokens: 1 } } })).toEqual([]);
    expect(t.push({ choices: [{ index: 0 }] })).toEqual([]);
    const end = t.end();
    expect(types(end)).toEqual(['response.output_text.done', 'response.content_part.done', 'response.output_item.done', 'response.completed']);
    expect(end[0].text).toBe('你好');
    const done = end[3].response;
    expect(done.output).toEqual([{ type: 'message', id: 'msg_r1_0', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text: '你好', annotations: [] }] }]);
    expect(done.usage).toEqual({ input_tokens: 3, input_tokens_details: { cached_tokens: 1 }, output_tokens: 2, output_tokens_details: { reasoning_tokens: 1 }, total_tokens: 5 });
    expect(t.end()).toEqual([]);
    expect(t.push({ choices: [{ delta: { content: 'x' } }] })).toEqual([]);
  });

  test('R-01 思考内容先成一个 reasoning 项，再出正文', () => {
    const t = tr('r2');
    const events = [
      ...t.push({ choices: [{ delta: { reasoning_content: '想' } }] }),
      ...t.push({ choices: [{ delta: { reasoning: '想好了' } }] }),
      ...t.push({ choices: [{ delta: { content: '答' } }] }),
      ...t.end(),
    ];
    expect(types(events).filter(x => x === 'response.reasoning_text.delta')).toHaveLength(2);
    const output = events[events.length - 1].response.output;
    expect(output[0]).toEqual({ type: 'reasoning', id: 'rs_r2_0', summary: [], content: [{ type: 'reasoning_text', text: '想想好了' }] });
    expect(output[1].content[0].text).toBe('答');
    expect(events[events.length - 1].response.usage).toMatchObject({ input_tokens: 0, total_tokens: 0 });
  });

  test('R-01 流式工具调用：参数分块拼起来，结束时出 function_call', () => {
    const t = tr('r3', { customTools: ['apply_patch'] });
    t.push({ choices: [{ delta: { content: '我来跑' } }] });
    t.push({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'exec_command', arguments: '{"cmd":' } }] } }] });
    t.push({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"ls"}' } }] } }] });
    t.push({ choices: [{ delta: { tool_calls: [{ id: 'call_2', function: { name: 'apply_patch', arguments: '{"input":' } }, 'junk'] } }] });
    t.push({ choices: [{ delta: { tool_calls: [{ function: { arguments: '"*** Begin"}' } }, { id: 'call_2', function: {} }] } }] });
    t.push({ choices: [{ delta: { tool_calls: [{ index: 2, function: { name: 'apply_patch', arguments: 'raw patch' } }] } }] });
    t.push({ choices: [{ delta: { tool_calls: [{ index: 3, function: { name: 'apply_patch', arguments: '{"other":1}' } }] } }] });
    t.push({ choices: [{ delta: { tool_calls: [{ index: 5, function: { name: 'noargs' } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 9, prompt_cache_hit_tokens: 4 } });
    const end = t.end();
    const output = end[end.length - 1].response.output;
    expect(output.map((o: Any) => o.type)).toEqual(['message', 'function_call', 'custom_tool_call', 'custom_tool_call', 'custom_tool_call', 'function_call']);
    expect(output[1]).toEqual({ type: 'function_call', id: 'fc_r3_1', status: 'completed', call_id: 'call_1', name: 'exec_command', arguments: '{"cmd":"ls"}' });
    expect(output[2]).toMatchObject({ call_id: 'call_2', name: 'apply_patch', input: '*** Begin' });
    expect(output[3]).toMatchObject({ call_id: 'call_r3_2', input: 'raw patch' });
    expect(output[4]).toMatchObject({ input: '{"other":1}' });
    expect(output[5]).toMatchObject({ call_id: 'call_r3_4', name: 'noargs', arguments: '{}' });
    expect(types(end).filter(x => x === 'response.output_item.added')).toHaveLength(5);
    expect(end[end.length - 1].response.usage).toMatchObject({ total_tokens: 9, input_tokens_details: { cached_tokens: 4 } });
  });

  test('R-01 流里带 error 时出 response.failed，之后不再出事件', () => {
    const t = tr('r4');
    const e = t.push({ error: { message: '余额不足', code: 'balance' } });
    expect(types(e)).toEqual(['response.created', 'response.failed']);
    expect(e[1].response.error).toEqual({ code: 'balance', message: '余额不足' });
    expect(t.end()).toEqual([]);
    const t2 = tr('r5');
    expect(t2.push({ error: {} })[1].response.error).toEqual({ code: 'upstream_error', message: '厂商返回了错误' });
  });

  test('R-01 什么都没收到就结束，也给出完整的 created 和 completed', () => {
    const end = tr('r6').end();
    expect(types(end)).toEqual(['response.created', 'response.completed']);
    expect(end[1].response.output).toEqual([]);
  });
});
