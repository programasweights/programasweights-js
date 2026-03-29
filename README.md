# @programasweights/web

Run ProgramAsWeights neural programs directly in the browser via WebAssembly. No server needed — data stays on the user's device.

## Install

```bash
npm install @programasweights/web
```

## Usage

```javascript
import paw from '@programasweights/web';

const fn = await paw.function('programasweights/email-triage');
const result = await fn('Urgent: server is down!');
// result: "immediate"
```

## How It Works

Programs compiled with the GPT-2 interpreter (~5 MB LoRA adapter) run via a WebAssembly build of llama.cpp. The 105 MB base model downloads once and is cached in the browser.

Features:
- Precomputed KV cache eliminates cold-start latency
- Multi-threaded WASM for fast inference (~200ms)
- IndexedDB caching for offline support
- Works with any GPT-2 PAW program

## Documentation

Full docs: https://programasweights.com/docs

## License

MIT
