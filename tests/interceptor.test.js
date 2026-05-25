import { isDeepSeekChatUrl, extractUsageFromChunks, buildRecord, injectUsageOption } from '../src/interceptor.js';

describe('isDeepSeekChatUrl', () => {
  test('matches deepseek chat completions URL', () => {
    expect(isDeepSeekChatUrl('https://api.deepseek.com/v1/chat/completions')).toBe(true);
  });
  test('does not match openai URL', () => {
    expect(isDeepSeekChatUrl('https://api.openai.com/v1/chat/completions')).toBe(false);
  });
  test('does not match deepseek balance URL', () => {
    expect(isDeepSeekChatUrl('https://api.deepseek.com/user/balance')).toBe(false);
  });
  test('handles invalid URL without throwing', () => {
    expect(isDeepSeekChatUrl('not-a-url')).toBe(false);
  });
  test('matches SillyTavern local backend endpoint', () => {
    expect(isDeepSeekChatUrl('/api/backends/chat-completions/generate')).toBe(true);
  });
  test('does not match other local paths', () => {
    expect(isDeepSeekChatUrl('/api/backends/other-endpoint')).toBe(false);
  });
});

describe('extractUsageFromChunks', () => {
  test('extracts usage from final SSE chunk', () => {
    const text = [
      'data: {"choices":[{"delta":{"content":"Hi"}}],"usage":null}',
      'data: {"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":20,"prompt_cache_hit_tokens":80,"prompt_cache_miss_tokens":20}}',
      'data: [DONE]',
    ].join('\n');
    const usage = extractUsageFromChunks(text);
    expect(usage.prompt_tokens).toBe(100);
    expect(usage.prompt_cache_hit_tokens).toBe(80);
  });
  test('returns null when no usage present', () => {
    expect(extractUsageFromChunks('data: [DONE]\n')).toBeNull();
  });
  test('skips chunks where usage is null', () => {
    expect(extractUsageFromChunks('data: {"usage":null}\n')).toBeNull();
  });
});

describe('injectUsageOption', () => {
  test('adds stream_options.include_usage to streaming request', () => {
    const opts = { body: JSON.stringify({ model: 'deepseek-chat', stream: true }) };
    const result = injectUsageOption(opts);
    expect(JSON.parse(result.body).stream_options.include_usage).toBe(true);
  });
  test('does not modify non-streaming request', () => {
    const opts = { body: JSON.stringify({ model: 'deepseek-chat', stream: false }) };
    const result = injectUsageOption(opts);
    expect(result).toBe(opts);
  });
  test('adds include_usage when stream field is absent', () => {
    const opts = { body: JSON.stringify({ model: 'deepseek-chat' }) };
    const result = injectUsageOption(opts);
    expect(JSON.parse(result.body).stream_options.include_usage).toBe(true);
  });
  test('preserves existing stream_options fields', () => {
    const opts = { body: JSON.stringify({ stream: true, stream_options: { other: 1 } }) };
    const result = injectUsageOption(opts);
    const body = JSON.parse(result.body);
    expect(body.stream_options.include_usage).toBe(true);
    expect(body.stream_options.other).toBe(1);
  });
});

describe('buildRecord', () => {
  test('maps usage fields to record fields', () => {
    const usage = { prompt_tokens: 100, completion_tokens: 50, prompt_cache_hit_tokens: 60, prompt_cache_miss_tokens: 40 };
    const r = buildRecord(usage, 'deepseek-chat', 'sess-1');
    expect(r.input_tokens).toBe(100);
    expect(r.output_tokens).toBe(50);
    expect(r.cache_hit_tokens).toBe(60);
    expect(r.cache_miss_tokens).toBe(40);
    expect(r.model).toBe('deepseek-chat');
    expect(r.session_id).toBe('sess-1');
    expect(typeof r.cost_usd).toBe('number');
    expect(typeof r.timestamp).toBe('number');
  });
});
