import { Wllama } from '@wllama/wllama';
import type { ProgramAssets, LoadOptions } from './types';
import { getBaseModelUrl } from './loader';

const WLLAMA_COMMIT = 'f8b7d6b28696d0f9575f82df7a54de3adc6ea49c';
const PAW_WASM_CDN_BASE = `https://cdn.jsdelivr.net/gh/programasweights/wllama@${WLLAMA_COMMIT}/esm`;

const WASM_PATHS = {
  'single-thread/wllama.wasm': `${PAW_WASM_CDN_BASE}/single-thread/wllama.wasm`,
  'multi-thread/wllama.wasm': `${PAW_WASM_CDN_BASE}/multi-thread/wllama.wasm`,
};

let sharedWllama: Wllama | null = null;
let loadedInterpreter: string | null = null;

async function getOrInitWllama(
  interpreter: string,
  onProgress?: LoadOptions['onProgress']
): Promise<Wllama> {
  if (sharedWllama && loadedInterpreter === interpreter) {
    return sharedWllama;
  }

  if (sharedWllama) {
    await sharedWllama.exit();
    sharedWllama = null;
    loadedInterpreter = null;
  }

  const wllama = new Wllama(WASM_PATHS, {
    suppressNativeLog: true,
  });

  const baseUrl = getBaseModelUrl(interpreter);

  const resp = await fetch(baseUrl);
  if (!resp.ok) throw new Error(`Base model download failed: ${resp.status}`);
  const total = parseInt(resp.headers.get('content-length') || '0');
  const reader = resp.body!.getReader();
  const chunks: BlobPart[] = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    if (onProgress) {
      onProgress({ loaded, total, stage: 'base-model' });
    }
  }
  const blob = new Blob(chunks);

  await wllama.loadModel([blob], { n_ctx: 2048 });

  sharedWllama = wllama;
  loadedInterpreter = interpreter;
  return wllama;
}

export class PawFunction {
  private assets: ProgramAssets;
  private wllama: Wllama | null = null;
  private adapterId: number | null = null;
  private prefixTokenCount = 0;
  private promptPrefix = '';
  private promptSuffix = '';
  private maxTokens: number;
  private temperature: number;
  private scale: number;

  constructor(assets: ProgramAssets, opts: LoadOptions = {}) {
    this.assets = assets;
    this.maxTokens = opts.maxTokens ?? 512;
    this.temperature = opts.temperature ?? 0;
    this.scale = opts.scale ?? 1.0;

    const placeholder = '{INPUT_PLACEHOLDER}';
    const parts = assets.promptTemplate.split(placeholder);
    this.promptPrefix = parts[0];
    this.promptSuffix = parts.length > 1 ? parts[1] : '';
  }

  async init(onProgress?: LoadOptions['onProgress']): Promise<void> {
    this.wllama = await getOrInitWllama(this.assets.meta.interpreter, onProgress);

    this.adapterId = await this.wllama.loadLoraAdapter(this.assets.adapterUrl, {
      scale: this.scale,
    });

    try {
      const [cacheResp, tokensResp] = await Promise.all([
        fetch(this.assets.prefixCacheUrl),
        fetch(this.assets.prefixTokensUrl),
      ]);

      if (cacheResp.ok && tokensResp.ok) {
        const cacheBlob = await cacheResp.blob();
        const prefixTokens: number[] = await tokensResp.json();
        this.prefixTokenCount = await (this.wllama as any).loadSession(cacheBlob, prefixTokens);
      }
    } catch {
      this.prefixTokenCount = 0;
    }
  }

  async run(input: string): Promise<string> {
    if (!this.wllama) {
      throw new Error('PawFunction not initialized. Call init() first.');
    }

    if (this.prefixTokenCount > 0) {
      await this.wllama.kvRemove(this.prefixTokenCount, -1);
    }

    const fullPrompt = this.promptPrefix + input + this.promptSuffix;
    const output = await this.wllama.createCompletion(fullPrompt, {
      nPredict: this.maxTokens,
      useCache: true,
      sampling: { temp: this.temperature },
    });
    return output.trim();
  }

  async free(): Promise<void> {
    if (this.wllama && this.adapterId !== null) {
      await this.wllama.freeLoraAdapter(this.adapterId);
      this.adapterId = null;
    }
  }

  get spec(): string {
    return this.assets.meta.spec;
  }

  get programId(): string {
    return this.assets.meta.program_id;
  }

  get interpreter(): string {
    return this.assets.meta.interpreter;
  }

  get hasPrefixCache(): boolean {
    return this.prefixTokenCount > 0;
  }
}
