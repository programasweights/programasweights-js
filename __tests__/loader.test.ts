import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resolveSlug, loadProgramAssets, getBaseModelUrl,
  setApiUrl, getRuntimeManifest, resolveRuntimeManifest,
} from '../src/loader';
import type { RuntimeManifest } from '../src/types';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
  setApiUrl('https://programasweights.com/api/v1');
});

const GPT2_META = {
  version: 4,
  program_id: 'abc123def456',
  spec: 'test spec',
  interpreter: 'gpt2',
  compiler_snapshot: 'paw-4b-gpt2-20260406',
  compiler_fingerprint: 'deadbeef',
  runtime_id: 'gpt2-q8_0',
  runtime_manifest_version: 1,
  lora_rank: 64,
  lora_alpha: 16,
  prefix_steps: 512,
  created_at: '2026-01-01T00:00:00Z',
};

const GPT2_RUNTIME: RuntimeManifest = {
  runtime_id: 'gpt2-q8_0',
  manifest_version: 1,
  display_name: 'GPT-2 124M (Q8_0)',
  interpreter: 'gpt2',
  inference_provider_url: 'http://localhost:9001',
  adapter_format: 'gguf_lora',
  prompt_template: { format: 'rendered_text', placeholder: '{INPUT_PLACEHOLDER}' },
  program_assets: {
    adapter_filename: 'adapter.gguf',
    prefix_cache_required: true,
    prefix_cache_filename: 'prefix_cache.bin',
    prefix_tokens_filename: 'prefix_tokens.json',
  },
  local_sdk: {
    supported: true,
    base_model: {
      provider: 'huggingface',
      repo: 'programasweights/GPT2-GGUF-Q8_0',
      file: 'gpt2-q8_0.gguf',
      url: 'https://huggingface.co/programasweights/GPT2-GGUF-Q8_0/resolve/main/gpt2-q8_0.gguf',
      sha256: null,
    },
    n_ctx: 2048,
  },
  js_sdk: {
    supported: true,
    base_model: {
      provider: 'huggingface',
      repo: 'programasweights/GPT2-GGUF-Q8_0',
      file: 'gpt2-q8_0.gguf',
      url: 'https://huggingface.co/programasweights/GPT2-GGUF-Q8_0/resolve/main/gpt2-q8_0.gguf',
      sha256: null,
    },
    prefix_cache_supported: true,
  },
  capabilities: {
    python_local: true,
    js_browser: true,
  },
};

// ── URL construction ──

describe('getBaseModelUrl', () => {
  it('returns correct URL for a runtime manifest', () => {
    const url = getBaseModelUrl(GPT2_RUNTIME);
    expect(url).toBe(
      'https://huggingface.co/programasweights/GPT2-GGUF-Q8_0/resolve/main/gpt2-q8_0.gguf'
    );
  });

  it('throws when a runtime lacks a browser base model', () => {
    const runtime = {
      ...GPT2_RUNTIME,
      js_sdk: { ...GPT2_RUNTIME.js_sdk, base_model: null },
    };
    expect(() => getBaseModelUrl(runtime)).toThrow('missing a browser base model');
  });
});

describe('resolveRuntimeManifest', () => {
  it('uses embedded runtime manifest when present', async () => {
    const runtime = await resolveRuntimeManifest({ ...GPT2_META, runtime: GPT2_RUNTIME });
    expect(runtime.runtime_id).toBe('gpt2-q8_0');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches runtime manifest by runtime_id when missing from meta', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => GPT2_RUNTIME,
    });
    const runtime = await resolveRuntimeManifest(GPT2_META);
    expect(runtime.runtime_id).toBe('gpt2-q8_0');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://programasweights.com/api/v1/models/runtimes/gpt2-q8_0'
    );
  });

  it('falls back to legacy gpt2 runtime when runtime endpoint fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    const runtime = await resolveRuntimeManifest(GPT2_META);
    expect(runtime.runtime_id).toBe('gpt2-q8_0');
    expect(runtime.js_sdk.supported).toBe(true);
  });

  it('rejects unsupported runtimes when neither manifest nor legacy fallback exists', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(resolveRuntimeManifest({
      ...GPT2_META,
      interpreter: 'Qwen/Qwen3-0.6B',
      runtime_id: 'qwen3-0.6b-q6_k',
    })).rejects.toThrow('does not support runtime');
  });
});

describe('getRuntimeManifest', () => {
  it('loads a runtime manifest from the API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => GPT2_RUNTIME,
    });
    const runtime = await getRuntimeManifest('gpt2-q8_0');
    expect(runtime.runtime_id).toBe('gpt2-q8_0');
  });

  it('throws on runtime lookup failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(getRuntimeManifest('gpt2-q8_0')).rejects.toThrow('Failed to load runtime manifest');
  });
});

// ── Slug resolution ──

describe('resolveSlug', () => {
  it('resolves a slug with slash to program_id', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ program_id: 'abc123', slug: 'test/my-program' }),
    });

    const id = await resolveSlug('test/my-program');
    expect(id).toBe('abc123');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://programasweights.com/api/v1/programs/resolve/test%2Fmy-program'
    );
  });

  it('resolves a bare name (no slash)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ program_id: 'xyz789', slug: 'programasweights/email-triage' }),
    });

    const id = await resolveSlug('email-triage');
    expect(id).toBe('xyz789');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://programasweights.com/api/v1/programs/resolve/email-triage'
    );
  });

  it('throws on 404 with descriptive message', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    try {
      await resolveSlug('unknown/slug');
      expect.unreachable('should have thrown');
    } catch (e: any) {
      expect(e.message).toContain('Failed to resolve');
      expect(e.message).toContain('unknown/slug');
    }
  });

  it('throws on 500 server error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(resolveSlug('test/program')).rejects.toThrow('500');
  });

  it('uses configured API URL', async () => {
    setApiUrl('http://localhost:8000/api/v1');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ program_id: 'xyz' }),
    });

    await resolveSlug('test/program');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/programs/resolve/test%2Fprogram'
    );
  });
});

// ── Configuration ──

describe('setApiUrl', () => {
  it('strips trailing slashes', async () => {
    setApiUrl('http://example.com/api/v1///');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ program_id: 'test' }),
    });
    await resolveSlug('test');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://example.com/api/v1/programs/resolve/test'
    );
  });

  it('default URL is production', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ program_id: 'test' }),
    });
    await resolveSlug('test');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('programasweights.com')
    );
  });
});

// ── Hash vs slug detection (via index.ts) ──

describe('hash detection', () => {
  it('hex string of 16+ chars is treated as hash', () => {
    expect(/^[a-f0-9]{16,64}$/.test('94f4ca7b5b7973f5b407')).toBe(true);
  });

  it('slug with slash is NOT a hash', () => {
    expect(/^[a-f0-9]{16,64}$/.test('da03/verb-counter')).toBe(false);
  });

  it('bare name is NOT a hash', () => {
    expect(/^[a-f0-9]{16,64}$/.test('email-triage')).toBe(false);
  });

  it('short hex is NOT a hash', () => {
    expect(/^[a-f0-9]{16,64}$/.test('abc123')).toBe(false);
  });
});

// ── loadProgramAssets ──

describe('loadProgramAssets', () => {
  it('loads HF metadata, polls HF assets, and returns runtime-aware URLs', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: true, json: async () => GPT2_META })
      .mockResolvedValueOnce({ ok: true, json: async () => GPT2_RUNTIME });
      [200, 200].forEach((status) => {
        mockFetch.mockResolvedValueOnce({ ok: status === 200, status });
      });
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => 'Hello {INPUT_PLACEHOLDER}' });

    const assets = await loadProgramAssets('abc123def456');
    expect(assets.meta.runtime_id).toBe('gpt2-q8_0');
    expect(assets.promptTemplate).toBe('Hello {INPUT_PLACEHOLDER}');
    expect(assets.baseModelUrl).toContain('GPT2-GGUF-Q8_0');
    expect(assets.adapterUrl).toBe('https://huggingface.co/programasweights/paw-programs/resolve/main/abc123def456/adapter.gguf');
    expect(assets.prefixCacheUrl).toBe('https://huggingface.co/programasweights/paw-programs/resolve/main/abc123def456/prefix_cache.bin');
    expect(assets.prefixTokensUrl).toBe('https://huggingface.co/programasweights/paw-programs/resolve/main/abc123def456/prefix_tokens.json');
  });

  it('rejects runtimes without browser support', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...GPT2_META,
          interpreter: 'Qwen/Qwen3-0.6B',
          runtime_id: 'qwen3-0.6b-q6_k',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...GPT2_RUNTIME,
          runtime_id: 'qwen3-0.6b-q6_k',
          interpreter: 'Qwen/Qwen3-0.6B',
          js_sdk: { supported: false, base_model: null, prefix_cache_supported: false },
        }),
      });

    await expect(loadProgramAssets('abc123')).rejects.toThrow('does not support runtime');
  });

  it('throws on meta fetch 404', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    await expect(loadProgramAssets('abc123')).rejects.toThrow('Failed to load program metadata');
  });

  it('throws on meta fetch 500', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(loadProgramAssets('abc123')).rejects.toThrow('500');
  });

  it('throws on prompt template fetch failure after assets are ready', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => GPT2_META,
      })
      .mockResolvedValueOnce({ ok: true, json: async () => GPT2_RUNTIME });
      [200, 200].forEach((status) => {
        mockFetch.mockResolvedValueOnce({ ok: status === 200, status });
      });
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    await expect(loadProgramAssets('abc123')).rejects.toThrow('prompt template');
  });

  it('throws on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network timeout'));

    await expect(loadProgramAssets('abc123')).rejects.toThrow('network timeout');
  });
});
