import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resolveSlug, loadProgramAssets, getBaseModelUrl, getAdapterUrl,
  setApiUrl, getPrefixCacheUrl, getPrefixTokensUrl, getBaseModelHFInfo,
} from '../src/loader';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
  setApiUrl('https://programasweights.com/api/v1');
});

const GPT2_META = {
  version: 3,
  program_id: 'abc123def456',
  spec: 'test spec',
  interpreter: 'gpt2',
  compiler_snapshot: 'paw-4b-gpt2-20260323',
  compiler_fingerprint: 'deadbeef',
  lora_rank: 64,
  lora_alpha: 16,
  prefix_steps: 512,
  created_at: '2026-01-01T00:00:00Z',
};

// ── URL construction ──

describe('getBaseModelUrl', () => {
  it('returns correct URL for gpt2', () => {
    const url = getBaseModelUrl('gpt2');
    expect(url).toBe(
      'https://huggingface.co/programasweights/GPT2-GGUF-Q6_K/resolve/main/gpt2-q6_k.gguf'
    );
  });

  it('throws for unsupported interpreter', () => {
    expect(() => getBaseModelUrl('llama-70b')).toThrow('Unsupported interpreter');
  });

  it('throws for empty interpreter', () => {
    expect(() => getBaseModelUrl('')).toThrow('Unsupported interpreter');
  });

  it('getBaseModelHFInfo returns repo and file', () => {
    const info = getBaseModelHFInfo('gpt2');
    expect(info.repo).toContain('GPT2');
    expect(info.file).toContain('gguf');
  });
});

describe('getAdapterUrl', () => {
  it('constructs correct HF URL', () => {
    const url = getAdapterUrl('abc123');
    expect(url).toBe(
      'https://huggingface.co/programasweights/paw-programs/resolve/main/abc123/adapter.gguf'
    );
  });
});

describe('getPrefixCacheUrl', () => {
  it('constructs correct URL', () => {
    const url = getPrefixCacheUrl('abc123');
    expect(url).toContain('abc123/prefix_cache.bin');
  });
});

describe('getPrefixTokensUrl', () => {
  it('constructs correct URL', () => {
    const url = getPrefixTokensUrl('abc123');
    expect(url).toContain('abc123/prefix_tokens.json');
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
  it('loads meta and prompt from HF CDN', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => GPT2_META })
      .mockResolvedValueOnce({ ok: true, text: async () => 'Hello {INPUT_PLACEHOLDER}' });

    const assets = await loadProgramAssets('abc123def456');
    expect(assets.meta).toEqual(GPT2_META);
    expect(assets.promptTemplate).toBe('Hello {INPUT_PLACEHOLDER}');
    expect(assets.adapterUrl).toContain('abc123def456/adapter.gguf');
    expect(assets.prefixCacheUrl).toContain('abc123def456/prefix_cache.bin');
    expect(assets.prefixTokensUrl).toContain('abc123def456/prefix_tokens.json');
  });

  it('rejects non-GPT-2 programs with clear message', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...GPT2_META, interpreter: 'Qwen/Qwen3-0.6B' }),
      })
      .mockResolvedValueOnce({ ok: true, text: async () => 'template' });

    try {
      await loadProgramAssets('abc123');
      expect.unreachable('should have thrown');
    } catch (e: any) {
      expect(e.message).toContain('only supports GPT-2');
      expect(e.message).toContain('Qwen');
    }
  });

  it('throws on meta fetch 404', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: true, text: async () => 'template' });

    await expect(loadProgramAssets('abc123')).rejects.toThrow('Failed to load program metadata');
  });

  it('throws on meta fetch 500', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, text: async () => 'template' });

    await expect(loadProgramAssets('abc123')).rejects.toThrow('500');
  });

  it('throws on prompt template fetch failure', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => GPT2_META })
      .mockResolvedValueOnce({ ok: false, status: 404 });

    await expect(loadProgramAssets('abc123')).rejects.toThrow('prompt template');
  });

  it('throws on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network timeout'));

    await expect(loadProgramAssets('abc123')).rejects.toThrow('network timeout');
  });
});
