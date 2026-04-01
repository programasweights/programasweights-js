# @programasweights/web

Run [PAW (Programs as Weights)](https://programasweights.com) neural programs directly in the browser. No server required.

PAW compiles natural language specifications into tiny neural programs. This SDK runs them client-side via WebAssembly, using a shared GPT-2 base model (105 MB, cached after first load) and per-program LoRA adapters (~5 MB each).

## Quick Start

```html
<script type="module">
  import paw from 'https://cdn.jsdelivr.net/npm/@programasweights/web';

  const fn = await paw.function('programasweights/email-triage');
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

// Load by slug (resolves via API)
const triage = await paw.function('programasweights/email-triage');

// Load by program ID (direct, no API call needed)
const fn = await paw.function('abc123def456');

// Run inference
const result = await triage('Check this urgent message');

// Show download progress
const fn2 = await paw.function('programasweights/json-fixer', {
  onProgress: ({ loaded, total, stage }) => {
    console.log(`${stage}: ${Math.round(loaded/total*100)}%`);
  },
});

// Clean up adapter (base model stays cached)
await fn2.free();
```

## How It Works

1. **First call**: downloads the GPT-2 Q6_K base model (~105 MB) and caches it in IndexedDB
2. **Per program**: downloads only the LoRA adapter (~5 MB) from HuggingFace CDN
3. **Inference**: runs entirely in the browser via WebAssembly (llama.cpp compiled to WASM)
4. **Subsequent visits**: base model loads from cache instantly

Multiple programs share one cached base model. Loading a second program is just a 5 MB download.

## API Reference

### `paw.function(slugOrId, options?)`

Loads a PAW program and returns a callable function.

**Parameters:**
- `slugOrId` — Program slug (e.g., `"programasweights/email-triage"`) or program ID hash
- `options.onProgress` — Callback for download progress: `({ loaded, total, stage }) => void`
- `options.maxTokens` — Maximum output tokens (default: 512)
- `options.temperature` — Sampling temperature, 0 = greedy (default: 0)

**Returns:** `Promise<(input: string) => Promise<string>>` — an async callable function

The returned function also has:
- `.free()` — releases the LoRA adapter (base model stays cached)
- `.spec` — the program's original specification
- `.programId` — the program's content-addressable ID

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
