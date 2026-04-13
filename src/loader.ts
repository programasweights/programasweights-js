import type { ProgramAssets, ProgramMeta, ProgressCallback, RuntimeBaseModel, RuntimeManifest } from './types';

const DEFAULT_API_URL = 'https://programasweights.com/api/v1';
const HF_BASE_URL = 'https://huggingface.co';
const ASSET_READY_TIMEOUT_MS = 60_000;
const ASSET_READY_POLL_MS = 2_000;

let configuredApiUrl = DEFAULT_API_URL;

export function setApiUrl(url: string): void {
  configuredApiUrl = url.replace(/\/+$/, '');
}

function buildHFUrl(info: RuntimeBaseModel): string {
  if (info.url) {
    return info.url;
  }
  return `${HF_BASE_URL}/${info.repo}/resolve/main/${info.file}`;
}

function getLegacyRuntimeManifest(interpreter: string): RuntimeManifest | null {
  if (interpreter !== 'gpt2') {
    return null;
  }
  return {
    runtime_id: 'gpt2-q8_0',
    manifest_version: 1,
    display_name: 'GPT-2 124M (Q8_0)',
    interpreter: 'gpt2',
    inference_provider_url: 'http://localhost:9001',
    adapter_format: 'gguf_lora',
    prompt_template: {
      format: 'rendered_text',
      placeholder: '{INPUT_PLACEHOLDER}',
    },
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
        url: `${HF_BASE_URL}/programasweights/GPT2-GGUF-Q8_0/resolve/main/gpt2-q8_0.gguf`,
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
        url: `${HF_BASE_URL}/programasweights/GPT2-GGUF-Q8_0/resolve/main/gpt2-q8_0.gguf`,
        sha256: null,
      },
      prefix_cache_supported: true,
    },
    capabilities: {
      python_local: true,
      js_browser: true,
    },
  };
}

export function getBaseModelUrl(runtime: RuntimeManifest): string {
  const info = runtime.js_sdk.base_model;
  if (!info) {
    throw new Error(
      `Runtime "${runtime.runtime_id}" is missing a browser base model definition.`
    );
  }
  return buildHFUrl(info);
}

function getProgramAssetUrl(programId: string, filename: string): string {
  return `${configuredApiUrl}/programs/${encodeURIComponent(programId)}/asset/${encodeURIComponent(filename)}`;
}

function getProgramUrl(programId: string): string {
  return `${configuredApiUrl}/programs/${encodeURIComponent(programId)}`;
}

function getPromptUrl(programId: string, promptFilename = 'prompt_template.txt'): string {
  return getProgramAssetUrl(programId, promptFilename);
}

export async function getRuntimeManifest(runtimeId: string): Promise<RuntimeManifest> {
  const resp = await fetch(`${configuredApiUrl}/models/runtimes/${encodeURIComponent(runtimeId)}`);
  if (!resp.ok) {
    throw new Error(`Failed to load runtime manifest "${runtimeId}": ${resp.status}`);
  }
  return resp.json();
}

export async function resolveRuntimeManifest(meta: ProgramMeta): Promise<RuntimeManifest> {
  if (meta.runtime?.js_sdk?.base_model || meta.runtime?.js_sdk?.supported) {
    return meta.runtime;
  }

  if (meta.runtime_id) {
    try {
      return await getRuntimeManifest(meta.runtime_id);
    } catch {
      // Fall through to the legacy map for older installed SDKs and bundles.
    }
  }

  const legacy = getLegacyRuntimeManifest(meta.interpreter);
  if (legacy) {
    return legacy;
  }

  throw new Error(
    `Browser inference does not support runtime "${meta.runtime_id || meta.interpreter}".`
  );
}

export async function resolveSlug(slug: string): Promise<string> {
  const resp = await fetch(`${configuredApiUrl}/programs/resolve/${encodeURIComponent(slug)}`);
  if (!resp.ok) {
    throw new Error(`Failed to resolve program slug "${slug}": ${resp.status}`);
  }
  const data = await resp.json();
  return data.program_id;
}

async function getProgramDetail(programId: string): Promise<any> {
  const resp = await fetch(getProgramUrl(programId));
  if (!resp.ok) {
    throw new Error(`Failed to load program metadata for "${programId}": ${resp.status}`);
  }
  return resp.json();
}

async function waitForAssetReady(url: string, label: string, optional = false): Promise<void> {
  const deadline = Date.now() + ASSET_READY_TIMEOUT_MS;
  let lastStatus = 0;
  while (Date.now() < deadline) {
    const resp = await fetch(url, { method: 'HEAD' });
    lastStatus = resp.status;
    if (resp.status === 202) {
      await new Promise(resolve => setTimeout(resolve, ASSET_READY_POLL_MS));
      continue;
    }
    if (resp.ok) {
      return;
    }
    if (optional && resp.status === 404) {
      return;
    }
    throw new Error(`Failed to load ${label}: ${resp.status}`);
  }
  throw new Error(`Timed out waiting for ${label} to be ready (last status: ${lastStatus})`);
}

export async function loadProgramAssets(
  programId: string,
  _onProgress?: ProgressCallback
): Promise<ProgramAssets> {
  const detail = await getProgramDetail(programId);
  const meta: ProgramMeta = {
    version: detail.runtime_manifest_version ?? 4,
    program_id: detail.id,
    spec: detail.spec,
    examples: detail.runtime?.examples ?? detail.examples,
    interpreter: detail.interpreter,
    compiler_snapshot: detail.compiler_snapshot,
    compiler_fingerprint: detail.compiler_fingerprint ?? '',
    compiler_kind: detail.compiler_kind,
    pseudo_program_strategy: detail.pseudo_program_strategy,
    runtime_id: detail.runtime_id,
    runtime_manifest_version: detail.runtime_manifest_version,
    runtime: detail.runtime,
    lora_rank: detail.runtime?.adapter?.lora_rank ?? 0,
    lora_alpha: detail.runtime?.adapter?.lora_alpha ?? 0,
    prefix_steps: detail.prefix_steps ?? 0,
    created_at: detail.created_at,
  };
  const runtime = await resolveRuntimeManifest(meta);

  if (!runtime.js_sdk.supported) {
    throw new Error(
      `Browser inference does not support runtime "${runtime.runtime_id}" (${runtime.interpreter}).`
    );
  }

  const hydratedMeta: ProgramMeta = {
    ...meta,
    runtime,
    runtime_id: meta.runtime_id ?? runtime.runtime_id,
    runtime_manifest_version: meta.runtime_manifest_version ?? runtime.manifest_version,
  };

  const adapterUrl = getProgramAssetUrl(
    programId,
    runtime.program_assets.adapter_filename || 'adapter.gguf'
  );
  const promptUrl = getPromptUrl(
    programId,
    typeof runtime.prompt_template?.filename === 'string'
      ? runtime.prompt_template.filename
      : 'prompt_template.txt'
  );
  const prefixCacheUrl = runtime.program_assets.prefix_cache_filename
    ? getProgramAssetUrl(programId, runtime.program_assets.prefix_cache_filename)
    : null;
  const prefixTokensUrl = runtime.program_assets.prefix_tokens_filename
    ? getProgramAssetUrl(programId, runtime.program_assets.prefix_tokens_filename)
    : null;

  await waitForAssetReady(adapterUrl, 'adapter');
  await waitForAssetReady(promptUrl, 'prompt template');
  const promptResp = await fetch(promptUrl);
  if (!promptResp.ok) {
    throw new Error(`Failed to load prompt template for "${programId}": ${promptResp.status}`);
  }
  const promptTemplate = await promptResp.text();

  return {
    meta: hydratedMeta,
    runtime,
    promptTemplate,
    baseModelUrl: getBaseModelUrl(runtime),
    adapterUrl,
    prefixCacheUrl,
    prefixTokensUrl,
  };
}
