import { resolveSlug, loadProgramAssets, setApiUrl } from './loader';
import { PawFunction } from './runtime';
import type { PawConfig, LoadOptions, ProgressCallback, ProgramMeta, PawCallable } from './types';

export type { PawConfig, LoadOptions, ProgressCallback, ProgramMeta, PawFunction, PawCallable };

export function configure(config: PawConfig): void {
  if (config.apiUrl) {
    setApiUrl(config.apiUrl);
  }
}

/**
 * Load a PAW program for browser-side inference.
 *
 * Accepts a program ID (hash) or a slug (e.g., "email-triage").
 * Downloads the base GPT-2 model (~134 MB, cached after first load) and the
 * program's browser assets (~12 MB total: ~5 MB adapter + ~7 MB prefix cache).
 * Returns a callable PawCallable.
 *
 * @example
 * ```ts
 * import paw from '@programasweights/web';
 *
 * const fn = await paw.function('email-triage');
 * const result = await fn('Urgent: server is down!');
 * console.log(result); // "immediate"
 *
 * // Limit output length
 * const short = await fn('Urgent: server is down!', 10);
 * ```
 */
async function loadFunction(
  slugOrId: string,
  opts: LoadOptions = {}
): Promise<PawCallable> {
  const isHash = /^[a-f0-9]{16,64}$/.test(slugOrId);
  const programId = isHash
    ? slugOrId
    : await resolveSlug(slugOrId);

  const assets = await loadProgramAssets(programId, opts.onProgress);
  const pawFn = new PawFunction(assets, opts);
  await pawFn.init(opts.onProgress);

  const callable = ((input: string, maxTokens?: number) =>
    pawFn.run(input, maxTokens)) as PawCallable;
  callable.free = () => pawFn.free();
  Object.defineProperty(callable, 'spec', { get: () => pawFn.spec });
  Object.defineProperty(callable, 'programId', { get: () => pawFn.programId });
  Object.defineProperty(callable, 'interpreter', { get: () => pawFn.interpreter });
  return callable;
}

const paw = {
  configure,
  function: loadFunction,
};

export default paw;
