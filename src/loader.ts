import type { ProgramAssets, ProgramMeta, ProgressCallback } from './types';

const DEFAULT_API_URL = 'https://programasweights.com/api/v1';
const HF_PROGRAMS_REPO = 'yuntian-deng/paw-programs';
const HF_BASE_URL = 'https://huggingface.co';

const HF_BASE_MODELS: Record<string, { repo: string; file: string }> = {
  gpt2: {
    repo: 'yuntian-deng/GPT2-GGUF-Q6_K',
    file: 'gpt2-q6_k.gguf',
  },
};

let configuredApiUrl = DEFAULT_API_URL;

export function setApiUrl(url: string): void {
  configuredApiUrl = url.replace(/\/+$/, '');
}

export function getBaseModelHFInfo(interpreter: string): { repo: string; file: string } {
  const info = HF_BASE_MODELS[interpreter];
  if (!info) {
    throw new Error(
      `Unsupported interpreter for browser inference: "${interpreter}". Only GPT-2 is supported.`
    );
  }
  return info;
}

export function getBaseModelUrl(interpreter: string): string {
  const info = getBaseModelHFInfo(interpreter);
  return `${HF_BASE_URL}/${info.repo}/resolve/main/${info.file}`;
}

export function getAdapterUrl(programId: string): string {
  return `${HF_BASE_URL}/${HF_PROGRAMS_REPO}/resolve/main/${programId}/adapter.gguf`;
}

function getMetaUrl(programId: string): string {
  return `${HF_BASE_URL}/${HF_PROGRAMS_REPO}/resolve/main/${programId}/meta.json`;
}

function getPromptUrl(programId: string): string {
  return `${HF_BASE_URL}/${HF_PROGRAMS_REPO}/resolve/main/${programId}/prompt_template.txt`;
}

export function getPrefixCacheUrl(programId: string): string {
  return `${HF_BASE_URL}/${HF_PROGRAMS_REPO}/resolve/main/${programId}/prefix_cache.bin`;
}

export function getPrefixTokensUrl(programId: string): string {
  return `${HF_BASE_URL}/${HF_PROGRAMS_REPO}/resolve/main/${programId}/prefix_tokens.json`;
}

export async function resolveSlug(slug: string): Promise<string> {
  const resp = await fetch(`${configuredApiUrl}/programs/resolve/${encodeURIComponent(slug)}`);
  if (!resp.ok) {
    throw new Error(`Failed to resolve program slug "${slug}": ${resp.status}`);
  }
  const data = await resp.json();
  return data.program_id;
}

export async function loadProgramAssets(
  programId: string,
  _onProgress?: ProgressCallback
): Promise<ProgramAssets> {
  const [metaResp, promptResp] = await Promise.all([
    fetch(getMetaUrl(programId)),
    fetch(getPromptUrl(programId)),
  ]);

  if (!metaResp.ok) {
    throw new Error(`Failed to load program metadata for "${programId}": ${metaResp.status}`);
  }
  if (!promptResp.ok) {
    throw new Error(`Failed to load prompt template for "${programId}": ${promptResp.status}`);
  }

  const meta: ProgramMeta = await metaResp.json();
  const promptTemplate = await promptResp.text();

  if (meta.interpreter !== 'gpt2') {
    throw new Error(
      `Browser inference only supports GPT-2 programs. This program uses "${meta.interpreter}".`
    );
  }

  return {
    meta,
    promptTemplate,
    adapterUrl: getAdapterUrl(programId),
    prefixCacheUrl: getPrefixCacheUrl(programId),
    prefixTokensUrl: getPrefixTokensUrl(programId),
  };
}
