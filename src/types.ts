export interface PawConfig {
  apiUrl?: string;
}

export interface LoadOptions {
  onProgress?: ProgressCallback;
  scale?: number;
  maxTokens?: number;
  temperature?: number;
}

export interface ProgressCallback {
  (progress: { loaded: number; total: number; stage: string }): void;
}

export interface RuntimeBaseModel {
  provider: string;
  repo: string;
  file: string;
  url?: string | null;
  sha256?: string | null;
}

export interface RuntimeManifest {
  runtime_id: string;
  manifest_version: number;
  display_name: string;
  interpreter: string;
  inference_provider_url: string;
  adapter_format: string;
  prompt_template: Record<string, unknown>;
  program_assets: {
    adapter_filename: string;
    prefix_cache_required: boolean;
    prefix_cache_filename?: string | null;
    prefix_tokens_filename?: string | null;
  };
  local_sdk: {
    supported: boolean;
    base_model: RuntimeBaseModel | null;
    n_ctx?: number;
  };
  js_sdk: {
    supported: boolean;
    base_model: RuntimeBaseModel | null;
    prefix_cache_supported: boolean;
  };
  capabilities: Record<string, boolean>;
}

export interface ProgramMeta {
  version: number;
  program_id: string;
  spec: string;
  examples?: Array<{ input: string; output: string }>;
  interpreter: string;
  compiler_snapshot: string;
  compiler_fingerprint: string;
  compiler_kind?: string;
  pseudo_program_strategy?: string;
  runtime_id?: string;
  runtime_manifest_version?: number;
  runtime?: RuntimeManifest;
  lora_rank: number;
  lora_alpha: number;
  prefix_steps: number;
  created_at: string;
}

export interface ProgramAssets {
  meta: ProgramMeta;
  runtime: RuntimeManifest;
  promptTemplate: string;
  baseModelUrl: string;
  adapterUrl: string;
  prefixCacheUrl?: string | null;
  prefixTokensUrl?: string | null;
}

/**
 * A loaded PAW function that can be called with a text input.
 * Returned by `paw.function()`.
 */
export interface PawCallable {
  (input: string, maxTokens?: number): Promise<string>;
  free(): Promise<void>;
  readonly spec: string;
  readonly programId: string;
  readonly interpreter: string;
}
