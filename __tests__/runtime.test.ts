import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PawFunction } from '../src/runtime';
import type { ProgramAssets } from '../src/types';

vi.mock('@wllama/wllama', () => ({
  Wllama: vi.fn(),
}));

vi.stubGlobal('fetch', vi.fn());

const MOCK_ASSETS: ProgramAssets = {
  meta: {
    version: 3,
    program_id: 'abc123def456789a',
    spec: 'test spec',
    interpreter: 'gpt2',
    compiler_snapshot: 'paw-4b-gpt2-20260323',
    compiler_fingerprint: 'deadbeef',
    lora_rank: 64,
    lora_alpha: 16,
    prefix_steps: 512,
    created_at: '2026-01-01T00:00:00Z',
  },
  promptTemplate: 'Process: {INPUT_PLACEHOLDER}\nOutput:',
  adapterUrl: 'https://example.com/adapter.gguf',
  prefixCacheUrl: 'https://example.com/prefix_cache.bin',
  prefixTokensUrl: 'https://example.com/prefix_tokens.json',
};

describe('PawFunction constructor', () => {
  it('defaults maxTokens to undefined when not provided', () => {
    const fn = new PawFunction(MOCK_ASSETS);
    expect((fn as any).defaultMaxTokens).toBeUndefined();
  });

  it('stores maxTokens from load options', () => {
    const fn = new PawFunction(MOCK_ASSETS, { maxTokens: 100 });
    expect((fn as any).defaultMaxTokens).toBe(100);
  });

  it('defaults temperature to 0', () => {
    const fn = new PawFunction(MOCK_ASSETS);
    expect((fn as any).temperature).toBe(0);
  });

  it('stores custom temperature', () => {
    const fn = new PawFunction(MOCK_ASSETS, { temperature: 0.5 });
    expect((fn as any).temperature).toBe(0.5);
  });

  it('splits prompt template correctly', () => {
    const fn = new PawFunction(MOCK_ASSETS);
    expect((fn as any).promptPrefix).toBe('Process: ');
    expect((fn as any).promptSuffix).toBe('\nOutput:');
  });

  it('handles template without placeholder suffix', () => {
    const assets = { ...MOCK_ASSETS, promptTemplate: '{INPUT_PLACEHOLDER}' };
    const fn = new PawFunction(assets);
    expect((fn as any).promptPrefix).toBe('');
    expect((fn as any).promptSuffix).toBe('');
  });

  it('exposes meta properties', () => {
    const fn = new PawFunction(MOCK_ASSETS);
    expect(fn.spec).toBe('test spec');
    expect(fn.programId).toBe('abc123def456789a');
    expect(fn.interpreter).toBe('gpt2');
  });
});

describe('PawFunction.run() maxTokens behavior', () => {
  let fn: PawFunction;
  let mockCreateCompletion: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockCreateCompletion = vi.fn().mockResolvedValue('  output  ');
    fn = new PawFunction(MOCK_ASSETS);
    (fn as any).wllama = {
      kvRemove: vi.fn(),
      createCompletion: mockCreateCompletion,
    };
    (fn as any).prefixTokenCount = 0;
  });

  it('uses 2048 (context limit) when no maxTokens set anywhere', async () => {
    await fn.run('hello');
    expect(mockCreateCompletion).toHaveBeenCalledWith(
      'Process: hello\nOutput:',
      expect.objectContaining({ nPredict: 2048 }),
    );
  });

  it('uses load-time maxTokens when set', async () => {
    const fn2 = new PawFunction(MOCK_ASSETS, { maxTokens: 256 });
    (fn2 as any).wllama = { kvRemove: vi.fn(), createCompletion: mockCreateCompletion };
    (fn2 as any).prefixTokenCount = 0;

    await fn2.run('hello');
    expect(mockCreateCompletion).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ nPredict: 256 }),
    );
  });

  it('per-call maxTokens overrides load-time default', async () => {
    const fn2 = new PawFunction(MOCK_ASSETS, { maxTokens: 256 });
    (fn2 as any).wllama = { kvRemove: vi.fn(), createCompletion: mockCreateCompletion };
    (fn2 as any).prefixTokenCount = 0;

    await fn2.run('hello', 50);
    expect(mockCreateCompletion).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ nPredict: 50 }),
    );
  });

  it('per-call maxTokens works when no load-time default', async () => {
    await fn.run('hello', 10);
    expect(mockCreateCompletion).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ nPredict: 10 }),
    );
  });

  it('per-call maxTokens=1 works for classification', async () => {
    await fn.run('classify this', 1);
    expect(mockCreateCompletion).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ nPredict: 1 }),
    );
  });

  it('explicit undefined per-call falls back to load-time default', async () => {
    const fn2 = new PawFunction(MOCK_ASSETS, { maxTokens: 200 });
    (fn2 as any).wllama = { kvRemove: vi.fn(), createCompletion: mockCreateCompletion };
    (fn2 as any).prefixTokenCount = 0;

    await fn2.run('hello', undefined);
    expect(mockCreateCompletion).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ nPredict: 200 }),
    );
  });

  it('trims output whitespace', async () => {
    mockCreateCompletion.mockResolvedValue('  trimmed result  ');
    const result = await fn.run('hello');
    expect(result).toBe('trimmed result');
  });

  it('constructs full prompt correctly', async () => {
    await fn.run('test input');
    expect(mockCreateCompletion).toHaveBeenCalledWith(
      'Process: test input\nOutput:',
      expect.any(Object),
    );
  });

  it('passes temperature=0 (greedy) by default', async () => {
    await fn.run('hello');
    expect(mockCreateCompletion).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ sampling: { temp: 0 } }),
    );
  });

  it('clears KV cache when prefix cache is loaded', async () => {
    const mockKvRemove = vi.fn();
    (fn as any).wllama.kvRemove = mockKvRemove;
    (fn as any).prefixTokenCount = 100;

    await fn.run('hello');
    expect(mockKvRemove).toHaveBeenCalledWith(100, -1);
  });

  it('does not clear KV cache when no prefix cache', async () => {
    const mockKvRemove = vi.fn();
    (fn as any).wllama.kvRemove = mockKvRemove;
    (fn as any).prefixTokenCount = 0;

    await fn.run('hello');
    expect(mockKvRemove).not.toHaveBeenCalled();
  });

  it('throws if not initialized', async () => {
    const uninitFn = new PawFunction(MOCK_ASSETS);
    await expect(uninitFn.run('hello')).rejects.toThrow('not initialized');
  });
});

describe('PawFunction.free()', () => {
  it('frees adapter when loaded', async () => {
    const fn = new PawFunction(MOCK_ASSETS);
    const mockFree = vi.fn();
    (fn as any).wllama = { freeLoraAdapter: mockFree };
    (fn as any).adapterId = 42;

    await fn.free();
    expect(mockFree).toHaveBeenCalledWith(42);
    expect((fn as any).adapterId).toBeNull();
  });

  it('no-op when no adapter loaded', async () => {
    const fn = new PawFunction(MOCK_ASSETS);
    (fn as any).wllama = { freeLoraAdapter: vi.fn() };
    (fn as any).adapterId = null;

    await fn.free();
    expect((fn as any).wllama.freeLoraAdapter).not.toHaveBeenCalled();
  });

  it('no-op when wllama is null', async () => {
    const fn = new PawFunction(MOCK_ASSETS);
    await fn.free();
  });
});
