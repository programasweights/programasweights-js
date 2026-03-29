import { resolveSlug, loadProgramAssets, setApiUrl } from './loader';
import { PawFunction } from './runtime';
import type { PawConfig, LoadOptions, ProgressCallback, ProgramMeta } from './types';

export type { PawConfig, LoadOptions, ProgressCallback, ProgramMeta, PawFunction };

export function configure(config: PawConfig): void {
  if (config.apiUrl) {
    setApiUrl(config.apiUrl);
  }
}

/**
 * Load a PAW program for browser-side inference.
 *
 * Accepts a program ID (hash) or a slug (e.g., "programasweights/email-triage").
 * Downloads the base GPT-2 model (~105 MB, cached after first load) and the
 * program's LoRA adapter (~5 MB). Returns a callable PawFunction.
 *
 * @example
 * ```ts
 * import paw from '@programasweights/web';
 *
 * const fn = await paw.function('programasweights/email-triage');
 * const result = await fn('Urgent: server is down!');
 * console.log(result); // "immediate"
 * ```
 */
async function loadFunction(
  slugOrId: string,
  opts: LoadOptions = {}
): Promise<(input: string) => Promise<string>> {
  const programId = slugOrId.includes('/')
    ? await resolveSlug(slugOrId)
    : slugOrId;

  const assets = await loadProgramAssets(programId, opts.onProgress);
  const fn = new PawFunction(assets, opts);
  await fn.init(opts.onProgress);

  const callable = (input: string) => fn.run(input);
  callable.free = () => fn.free();
  callable.spec = fn.spec;
  callable.programId = fn.programId;
  callable.interpreter = fn.interpreter;
  return callable;
}

const paw = {
  configure,
  function: loadFunction,
};

export default paw;
