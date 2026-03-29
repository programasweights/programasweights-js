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

export interface ProgramMeta {
  version: number;
  program_id: string;
  spec: string;
  interpreter: string;
  compiler_snapshot: string;
  compiler_fingerprint: string;
  lora_rank: number;
  lora_alpha: number;
  prefix_steps: number;
  created_at: string;
}

export interface ProgramAssets {
  meta: ProgramMeta;
  promptTemplate: string;
  adapterUrl: string;
  prefixCacheUrl: string;
  prefixTokensUrl: string;
}
