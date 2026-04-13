# @programasweights/web

Run [PAW (Programs as Weights)](https://programasweights.com) neural programs directly in the browser. No custom server required for inference.

PAW compiles natural language specifications into tiny neural programs. This SDK runs them client-side via WebAssembly, using a shared GPT-2 base model (134 MB, cached after first load) and per-program assets (~12 MB total: ~5 MB LoRA adapter + ~7 MB prefix cache).

## Quick Start

```html
<script type="module">
  import paw from 'https://cdn.jsdelivr.net/npm/@programasweights/web';

  const fn = await paw.function('email-triage-browser');
  const result = await fn('Urgent: server is down!');
  console.log(result); // "immediate"
</script>
```

## Installation

```bash
npm install @programasweights/web
```

## Usage

```typescript
import paw from '@programasweights/web';

// Load by slug (resolves via the PAW API)
const triage = await paw.function('email-triage-browser');

// Load by program ID (direct, no API call needed)
const fn = await paw.function('abc123def456');

// Run inference
const result = await triage('Check this urgent message');

// Limit output length (default: generates until EOS or context limit)
const short = await triage('Check this', 10);

// Show download progress
const fn2 = await paw.function('email-triage-browser', {
  onProgress: ({ loaded, total, stage }) => {
    console.log(`${stage}: ${Math.round(loaded/total*100)}%`);
  },
});

// Clean up adapter (base model stays cached)
await fn2.free();
```

## How It Works

1. **First call**: downloads the GPT-2 Q8_0 base model (~134 MB) and caches it in IndexedDB
2. **Per program**: downloads the program assets (~12 MB total: ~5 MB LoRA adapter + ~7 MB prefix cache) from Hugging Face CDN
3. **Inference**: runs entirely in the browser via WebAssembly (llama.cpp compiled to WASM)
4. **Subsequent visits**: base model loads from cache instantly

Multiple programs share one cached base model. Loading a second program is just a ~12 MB download.

If you load a program by content-addressable ID, the browser runtime only depends on Hugging Face-hosted assets. Slugs still need the PAW API for the initial ID lookup.

## API Reference

### `paw.function(slugOrId, options?)`

Loads a PAW program and returns a callable function.

**Parameters:**
- `slugOrId` — Program slug (for example `"email-triage-browser"`) or program ID hash
- `options.onProgress` — Callback for download progress: `({ loaded, total, stage }) => void`
- `options.maxTokens` — Default max output tokens (default: unlimited, runs until EOS or context limit)
- `options.temperature` — Sampling temperature, 0 = greedy (default: 0)

**Returns:** `Promise<PawCallable>` — an async callable with per-call options

```typescript
const fn = await paw.function('email-triage-browser');

// Default: generates until EOS or context limit
const result = await fn('Urgent: server is down!');

// Override max tokens per call
const short = await fn('Urgent: server is down!', 5);
```

The returned callable also has:
- `.free()` — releases the LoRA adapter (base model stays cached)
- `.spec` — the program's original specification
- `.programId` — the program's content-addressable ID
- `.interpreter` — the interpreter name

### `paw.configure(config)`

Set global configuration.

```typescript
paw.configure({
  apiUrl: 'https://your-server.com/api/v1',  // custom API for slug resolution
});
```

## Browser Compatibility

| Feature | Support | Notes |
|---------|---------|-------|
| WASM SIMD | ~95% | Required for inference |
| Multi-threaded WASM | ~85% | Faster inference, requires COOP/COEP headers |
| Single-threaded fallback | ~95% | Automatic when multi-thread unavailable |

### Enabling Multi-threaded Mode

For best performance, add these response headers to your web server:

```
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
```

## Performance

Expected performance for GPT-2 124M on modern hardware:

| Metric | Single-thread | Multi-thread |
|--------|--------------|--------------|
| Model load (cached) | ~2s | ~1s |
| LoRA apply | ~200ms | ~200ms |
| Tokens/sec | ~5-15 | ~15-40 |

## License

MIT
