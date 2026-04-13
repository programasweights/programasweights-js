/**
 * Browser E2E tests for @programasweights/web SDK.
 *
 * Runs real browser inference via Playwright + COOP/COEP test server.
 * Downloads the 134MB GPT-2 base model on first run (cached after).
 */
import { test, expect, type Page } from '@playwright/test';

const TEST_URL = 'http://localhost:9876';
const KNOWN_GPT2_HASH = 'd34792fc9654c0a41483';
const LOAD_TIMEOUT = 180_000;

async function loadProgram(
  page: Page,
  ref: string,
  opts: Record<string, unknown> = {},
): Promise<void> {
  await page.evaluate(
    async ({ ref, opts }) => {
      const fn = await (window as any).paw.function(ref, opts);
      (window as any)._fn = fn;
    },
    { ref, opts },
  );
}

async function runInference(page: Page, input: string): Promise<string> {
  return page.evaluate(async (input) => {
    const fn = (window as any)._fn;
    if (!fn) throw new Error('No function loaded');
    return fn(input);
  }, input);
}

async function freeFn(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const fn = (window as any)._fn;
    if (fn?.free) await fn.free();
    (window as any)._fn = null;
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto(TEST_URL);
  await page.waitForFunction(() => (window as any).paw !== undefined, null, {
    timeout: 10_000,
  });
});

// ── Loading programs ──

test.describe('Loading programs', () => {
  test('load by slug', async ({ page }) => {
    await loadProgram(page, 'da03/verb-counter');
    const hasFn = await page.evaluate(() => typeof (window as any)._fn === 'function');
    expect(hasFn).toBe(true);
  });

  test('load by hash ID', async ({ page }) => {
    await loadProgram(page, KNOWN_GPT2_HASH);
    const hasFn = await page.evaluate(() => typeof (window as any)._fn === 'function');
    expect(hasFn).toBe(true);
  });

  test('nonexistent program rejects', async ({ page }) => {
    const error = await page.evaluate(async () => {
      try {
        await (window as any).paw.function('nonexistent/fake-program-xyz');
        return null;
      } catch (e: any) {
        return e.message;
      }
    });
    expect(error).toBeTruthy();
    expect(error).toContain('nonexistent');
  });
});

// ── Inference ──

test.describe('Inference', () => {
  test.beforeEach(async ({ page }) => {
    await loadProgram(page, KNOWN_GPT2_HASH);
  });

  test('returns a string', async ({ page }) => {
    const result = await runInference(page, 'server is down');
    expect(typeof result).toBe('string');
  });

  test('returns non-empty output', async ({ page }) => {
    const result = await runInference(page, 'URGENT: production database is corrupted');
    expect(result.length).toBeGreaterThan(0);
  });

  test('multiple calls return strings', async ({ page }) => {
    for (let i = 0; i < 3; i++) {
      const result = await runInference(page, `test input ${i}`);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    }
  });

  test('different inputs produce output', async ({ page }) => {
    const r1 = await runInference(page, 'server is down');
    const r2 = await runInference(page, 'spring picnic newsletter');
    expect(r1.length).toBeGreaterThan(0);
    expect(r2.length).toBeGreaterThan(0);
  });

  test('empty input does not crash', async ({ page }) => {
    const result = await runInference(page, '');
    expect(typeof result).toBe('string');
  });

  test('special characters handled', async ({ page }) => {
    const result = await runInference(page, 'café naïve résumé — "urgent" <alert>');
    expect(typeof result).toBe('string');
  });
});

// ── Accessors ──

test.describe('Accessors', () => {
  test.beforeEach(async ({ page }) => {
    await loadProgram(page, KNOWN_GPT2_HASH);
  });

  test('fn.spec is set', async ({ page }) => {
    const spec = await page.evaluate(() => (window as any)._fn.spec);
    expect(typeof spec).toBe('string');
    expect(spec.length).toBeGreaterThan(0);
  });

  test('fn.programId is set', async ({ page }) => {
    const pid = await page.evaluate(() => (window as any)._fn.programId);
    expect(pid).toBe(KNOWN_GPT2_HASH);
  });

  test('fn.interpreter is gpt2', async ({ page }) => {
    const interp = await page.evaluate(() => (window as any)._fn.interpreter);
    expect(interp).toBe('gpt2');
  });
});

// ── Progress callback ──

test.describe('Progress callback', () => {
  test('onProgress fires during load', async ({ page }) => {
    const progressCalls = await page.evaluate(async (hash) => {
      const calls: any[] = [];
      await (window as any).paw.function(hash, {
        onProgress: (p: any) => calls.push({ ...p }),
      });
      return calls;
    }, KNOWN_GPT2_HASH);
    expect(progressCalls.length).toBeGreaterThan(0);
  });

  test('progress includes base-model stage', async ({ page }) => {
    const stages = await page.evaluate(async (hash) => {
      const s = new Set<string>();
      await (window as any).paw.function(hash, {
        onProgress: (p: any) => s.add(p.stage),
      });
      return Array.from(s);
    }, KNOWN_GPT2_HASH);
    expect(stages).toContain('base-model');
  });
});

// ── Resource management ──

test.describe('Resource management', () => {
  test('free completes without error', async ({ page }) => {
    await loadProgram(page, KNOWN_GPT2_HASH);
    await freeFn(page);
  });

  test('free is idempotent', async ({ page }) => {
    await loadProgram(page, KNOWN_GPT2_HASH);
    await freeFn(page);
    await freeFn(page);
  });

  test('load after free works', async ({ page }) => {
    await loadProgram(page, KNOWN_GPT2_HASH);
    await freeFn(page);
    await loadProgram(page, KNOWN_GPT2_HASH);
    const result = await runInference(page, 'test');
    expect(typeof result).toBe('string');
  });
});

// ── Multi-program ──

test.describe('Multi-program', () => {
  test('sequential load-infer-free-load-infer', async ({ page }) => {
    await loadProgram(page, KNOWN_GPT2_HASH);
    const r1 = await runInference(page, 'server down');
    expect(r1.length).toBeGreaterThan(0);
    await freeFn(page);

    await loadProgram(page, KNOWN_GPT2_HASH);
    const r2 = await runInference(page, 'newsletter');
    expect(r2.length).toBeGreaterThan(0);
  });
});

// ── Configure ──

test.describe('Configure', () => {
  test('configure before function works', async ({ page }) => {
    await page.evaluate(async () => {
      (window as any).paw.configure({
        apiUrl: 'https://programasweights.com/api/v1',
      });
    });
    await loadProgram(page, KNOWN_GPT2_HASH);
    const result = await runInference(page, 'test');
    expect(typeof result).toBe('string');
  });
});
