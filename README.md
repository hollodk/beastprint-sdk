# beastprint-sdk

Unified web printing for:

- **Legacy** browser printing (window.print, iframe, popup)
- **BeastPrint** cloud printing (template or HTML)
- **Printdesk**-style local printing (HTML to a local agent)

You can:

- Use it from **npm** in bundlers (Vite, Webpack, etc.)
- Use it via **CDN** as an ES module
- Use it as a **global** `window.beastprint.print` in plain `<script>` pages
- Use a smart `auto` strategy to try **BeastPrint → Printdesk → Legacy** in order.

---

## Installation

```bash
npm install beastprint-sdk
# or
yarn add beastprint-sdk
# or
pnpm add beastprint-sdk
```

---

## Basic usage

### In a bundler (Vite, Webpack, etc.)

```ts
import { print } from 'beastprint-sdk';

// Simple legacy print (browser print dialog)
await print({ strategy: 'legacy' });

// Print HTML via legacy iframe-based printing
await print({
  strategy: 'legacy',
  legacy: {
    html: `
      <h1>Hello from legacy printing</h1>
      <p>This will be printed via an invisible iframe.</p>
    `,
  },
});
```

### From CDN as an ES module

You can use services like [esm.run](https://esm.run/) or [jsDelivr](https://www.jsdelivr.com/):

```html
<script type="module">
  import { print } from 'https://esm.run/beastprint-sdk';

  document.addEventListener('click', () => {
    print({
      strategy: 'legacy',
      legacy: {
        html: '<h1>CDN print test</h1>',
      },
    });
  });
</script>
```

### As a browser global (`window.beastprint.print`)

The build also ships a browser-global bundle that attaches `window.beastprint.print`.

After you host/publish `dist/beastprint.global.global.js` somewhere (or from your own CDN):

```html
<script src="https://your-cdn.com/beastprint.global.global.js"></script>
<script>
  // Now window.beastprint.print is available
  window.beastprint.print({
    strategy: 'legacy',
    legacy: {
      html: `
        <html>
          <body>
            <h1>Global legacy print</h1>
            <p>Using window.beastprint.print()</p>
          </body>
        </html>
      `,
    },
  });
</script>
```

> Note: the file name is `beastprint.global.global.js` because of how tsup names IIFE builds from the `beastprint.global` entry.

---

## API

### `print(options?: PrintOptions): Promise<void>`

Top-level function that routes print jobs to:

- **Legacy** browser printing
- **BeastPrint** cloud API
- **Printdesk** local agent

#### Types

```ts
export type LegacyPrintOptions = {
  html?: string;   // raw HTML string to print
  url?: string;    // URL to open and print

  // Page / print CSS size control
  pageWidthMm?: number;   // e.g. 80 for 80mm receipt paper
  pageHeightMm?: number;  // optional; if omitted, browser paginates
  marginMm?: number;      // uniform margin in mm (default 0)
  hideAppChrome?: boolean; // hide header/footer/nav etc in print

  // Popup-style printing (alternative to iframe)
  popup?: boolean;        // if true, open new window instead of iframe
  popupWidthPx?: number;  // popup window width in pixels
  popupHeightPx?: number; // popup window height in pixels

  // URL-in-iframe mode (non-popup, stays on the same page)
  // Note: currently URL printing defaults to iframe when popup is false.
  urlInIframe?: boolean;
};

export type BeastPrintPrinter = {
  key: string;
  profileKey?: string;
};

export type BeastPrintOptions = {
  mode?: 'template' | 'html';
  templateId?: string;
  widthMm?: number;
  data?: Record<string, any>;
  printer?: BeastPrintPrinter;
  html?: string;   // used when mode === 'html'
  url?: string;    // URL to fetch HTML from when mode === 'html'
};

export type PrintdeskOptions = {
  /**
   * Raw HTML string to send to the local Printdesk service.
   * If not provided, URL-based fetching will be used.
   */
  html?: string;
  /**
   * URL to fetch HTML from. Used if html is not provided.
   * If not set here, the shared top-level url will be used as a fallback.
   */
  url?: string;
  /**
   * URL of the local Printdesk endpoint.
   * Defaults to 'http://127.0.0.1:43594/print'.
   */
  localUrl?: string;
};

export type PrintStrategy = 'auto' | 'legacy' | 'beast' | 'printdesk';

export type PrintOptions = {
  strategy?: PrintStrategy;
  legacy?: LegacyPrintOptions;
  beast?: BeastPrintOptions;
  printdesk?: PrintdeskOptions;
  /**
   * Top-level HTML payload that can be reused by multiple strategies.
   * For example:
   * - used as legacy.html if legacy.html is not provided
   * - used as beast.html when beast.mode === 'html' and beast.html is not provided
   */
  html?: string;
  /**
   * Top-level URL payload that can be reused by multiple strategies.
   * For example, used as legacy.url if legacy.url is not provided.
   */
  url?: string;
  /**
   * Enable debug logging only for this call.
   * Overrides the global configureDebug() setting for this invocation.
   */
  debug?: boolean;
  /**
   * If true, non-legacy strategies (beast, printdesk, auto) will fall back
   * to legacy printing (when legacy options are provided) instead of throwing.
   * (Explicit 'legacy' strategy is never affected.)
   */
  fallbackToLegacyOnError?: boolean;
};
```

---

### How `strategy: 'auto'` works (simple explanation)

`auto` is the default strategy. It tries to be as smart and migration-friendly as possible:

> **Beast → Printdesk → Legacy**, in that order.

Given one call to `print(options)`:

1. **BeastPrint (cloud)**

   - Considered “configured” if `beast.printer.key` is a non-empty string.
   - If `beast.templateId` is set:
     - Sends a **template** job:
       ```json
       { "mode": "template", "templateId": "...", "data": { ... }, "printer": { ... } }
       ```
   - Else if `beast.mode === 'html'`:
     - Uses:
       - `beast.html`, or
       - `beast.url` → fetched as HTML, or
       - shared `options.html`, or
       - shared `options.url` → injected as `beast.url` and fetched as HTML.
     - Sends a **HTML** job:
       ```json
       { "mode": "html", "content": "<!doctype html>..." }
       ```

   - If Beast is not configured or its request fails, `auto` logs the error and moves on.

2. **Printdesk (local)**

   - Considered “configured” if **either**:
     - `printdesk.html` is a non-empty string, or
     - `printdesk.url` is a non-empty string (or shared `options.url` injected).
   - Priority:
     1. If `printdesk.html` is set → send that to `printdesk.localUrl` (default `http://127.0.0.1:43594/print`).
     2. Else if `printdesk.url` is set → fetch that URL as HTML and send the result.

   - If Beast also has a `beast.templateId` and Printdesk has no HTML of its own:
     - The SDK renders the template to HTML via:
       ```http
       POST https://print.beastscan.com/render/html
       ```
     - Then uses that HTML as `printdesk.html` and sends it to the local agent.

   - If Printdesk is not configured or its request fails, `auto` logs the error and moves on.

3. **Legacy (browser)**

   - Considered usable if:
     - `legacy` options are present, or
     - shared `options.html` / `options.url` is present.
   - Priority:
     1. If `legacy.html` or shared `html` is present → print that via iframe or popup.
     2. Else if `legacy.url` or shared `url` is present:
        - If same-origin and no `popup` → load in hidden iframe and call `print()`.
        - If cross-origin and no `popup` → open in a new tab and log a warning (user must print manually).
        - If `popup: true` → open popup and call `print()`.

   - If Beast has a `templateId` and Legacy has no `html`/`url`, the SDK again renders the template to HTML and uses that as `legacy.html`.

4. **If none are usable** (no Beast, no Printdesk, no Legacy config), `auto` throws:

```text
[beastprint] auto strategy: no usable configuration for beast, printdesk, or legacy
```

That’s all `auto` does: it tries Beast first, then Printdesk, then Legacy, reusing shared `html`/`url` and (if configured) a Beast template.

---

### Debug mode

For troubleshooting, you can enable a debug log so you see exactly what `auto` is doing:

```ts
import { print, configureDebug } from 'beastprint-sdk';

configureDebug({ enabled: true });

await print({
  strategy: 'auto',
  beast: { /* ... */ },
  printdesk: { /* ... */ },
  legacy: { /* ... */ },
});
```

Or per-call:

```ts
await print({
  strategy: 'auto',
  debug: true,
  // ...
});
```

Example logs:

```text
[beastprint:debug] print called { strategy: 'auto', ... }
[beastprint:debug] auto: beast configuration check { hasBeastConfig: true, beastOpts: ... }
[beastprint:debug] beastPrint: effective mode and config { hasTemplateId: true, mode: 'template', ... }
[beastprint:debug] beastPrint: sending template print { ... }
[beastprint:debug] auto → BeastPrint succeeded
```

Or when Beast fails and templates are reused:

```text
[beastprint:debug] print: beast.templateId detected { templateId: 'default-receipt', ... }
[beastprint:debug] renderTemplateToHtml: rendering via BeastPrint { ... }
[beastprint:debug] print: rendered template HTML from beast.templateId for reuse { ... }
[beastprint:debug] auto → Printdesk: injecting rendered Beast template HTML into printdeskOpts.html { ... }
[beastprint:debug] auto → Printdesk succeeded
```

---

## Legacy printing

See “Legacy printing” in the current README for details — it already matches the code (iframe/popup, cross-origin handling). No deprecated parts there.

---

## BeastPrint cloud printing

See “BeastPrint cloud printing” section above — template and HTML modes are up to date and use the correct field names (`templateId`, `data`, `content`).

---

## Printdesk local printing

The **Printdesk** path posts HTML to a local agent:

```ts
await print({
  strategy: 'printdesk',
  printdesk: {
    html: '<h1>Local Printdesk HTML</h1>',
    // Or:
    // url: 'https://example.com/printdesk-receipt',
    // localUrl: 'http://127.0.0.1:43594/print', // optional override
  },
});
```

Behavior:

1. If `printdesk.html` is set → use it.
2. Else if `printdesk.url` (or shared `url`) is set:
   - Fetch it as HTML.
3. If Beast has a `templateId` and Printdesk has no `html`:
   - Render the template via BeastPrint `/render/html`.
   - Use that HTML as `printdesk.html`.

If the local agent responds with non-2xx, `print` throws with status + body (if available).

---

## Development

### Build

```bash
npm install
npm run build
```

Outputs:

- `dist/index.esm.js` (ESM)
- `dist/index.cjs` (CJS)
- `dist/index.d.ts` (types)
- `dist/beastprint.global.global.js` (IIFE global)

### Test harness

A static test harness lives under `test/`:

- `test/index.html` – unified page that covers:
  - Legacy printing (window.print, iframe, popup),
  - BeastPrint (template + HTML mode),
  - Printdesk (local agent HTML mode),
  - `strategy: 'auto'` (Beast → Printdesk → Legacy).

Run:

```bash
npm run build
npm run test:server
```

Open:

- `http://localhost:3000/test/index.html`

Use the “Auto strategy” card to exercise `auto`, and the log panel + browser console (with debug enabled) to see exactly which strategies run and in what order.

---

## License

MIT © Michael Holm
