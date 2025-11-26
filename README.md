# beastprint-sdk

Unified web printing for legacy browser printing and the BeastPrint cloud service.

- Use it from **npm** in bundlers (Vite, Webpack, etc.)
- Use it via **CDN** as an ES module
- Use it as a **global** `window.beastprint.print` in plain `<script>` pages
- Smoothly **migrate** from “Ctrl+P / HTML templates” to BeastPrint’s cloud printing

## Installation

```bash
npm install beastprint-sdk
# or
yarn add beastprint-sdk
# or
pnpm add beastprint-sdk
```

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

Top-level function that routes print jobs to either the **legacy** browser print path or **BeastPrint** cloud API, with an optional `auto` strategy.

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
};

export type PrintStrategy = 'auto' | 'legacy' | 'beast';

export type PrintOptions = {
  strategy?: PrintStrategy;
  legacy?: LegacyPrintOptions;
  beast?: BeastPrintOptions;
};
```

#### Strategy routing

```ts
await print({
  strategy: 'legacy', // or 'beast' | 'auto'
  legacy: { /* ... */ },
  beast: { /* ... */ },
});
```

- `strategy: 'legacy'`  
  Always use the legacy browser-based print behavior.
- `strategy: 'beast'`  
  Always use the BeastPrint cloud endpoint.
- `strategy: 'auto'` (default)  
  - If valid BeastPrint configuration is present, try BeastPrint first.
  - If BeastPrint fails or config is missing, fall back to legacy printing.

---

## Legacy printing

The **legacy** path is meant to support:

- Existing HTML templates (iframes / popups).
- Migration from older popup-based systems.
- Precise-ish control over page/document size using CSS and window size.

### 1. Basic browser print (Ctrl+P style)

If you call `print` with no `legacy` options, it just calls `window.print()`:

```ts
await print({ strategy: 'legacy' });
```

If `window.print` is not available, it throws an error.

### 2. Print an existing URL (popup window)

```ts
await print({
  strategy: 'legacy',
  legacy: {
    url: '/receipt/123',
    popup: true,            // open as a popup window
    popupWidthPx: 400,
    popupHeightPx: 600,
  },
});
```

This:

- Opens a new window with `/receipt/123`.
- Optionally sizes it with the provided pixel dimensions.
- Calls `window.print()` on that window after load.

Use this if you already have print-optimized routes.

### 3. Print HTML directly (iframe, default)

```ts
await print({
  strategy: 'legacy',
  legacy: {
    html: `
      <div>
        <h1>Legacy HTML content</h1>
        <p>Printed via iframe.</p>
      </div>
    `,
    pageWidthMm: 80,
    marginMm: 0,
    hideAppChrome: true,
  },
});
```

- The HTML is wrapped into a minimal standalone document.
- `@page` is configured based on `pageWidthMm`, `pageHeightMm`, `marginMm`.
- Common header/footer/nav classes are hidden when `hideAppChrome` is `true`.
- Rendering is done in an invisible `<iframe>` injected into the page, then printed.

### 4. Print HTML in a popup (legacy-compatible mode)

If you prefer the old “popup renders a standalone print page” behavior:

```ts
await print({
  strategy: 'legacy',
  legacy: {
    html: `
      <div style="width: 300px;">
        <h1>Receipt</h1>
        <p>Some content...</p>
      </div>
    `,
    popup: true,           // use a popup window instead of an iframe
    popupWidthPx: 400,
    popupHeightPx: 600,
    pageWidthMm: 80,
    marginMm: 0,
    hideAppChrome: true,
  },
});
```

- A new window is opened with your HTML content.
- The same `@page` and CSS rules are applied to control printed layout.
- The popup auto-prints and then (optionally) auto-closes.

> Note: browsers and printer drivers ultimately decide how strictly to honor `@page size` and margins. This library sets the correct CSS, but physical results can vary by device.

---

## BeastPrint cloud printing

The **BeastPrint** path sends jobs to:

```txt
POST https://print.beastscan.com/print
Content-Type: application/json
```

### Template mode

Use pre-defined templates on the BeastPrint service:

```ts
await print({
  strategy: 'beast',
  beast: {
    mode: 'template',
    templateId: 'default-receipt',
    widthMm: 80,
    data: {
      store: { name: 'Guestify' },
      time: new Date().toISOString(),
    },
    printer: {
      key: 'YOUR_PRINTER_KEY',
      profileKey: 'epson-tm-m30ii',
    },
  },
});
```

### HTML mode

Send raw HTML to BeastPrint:

```ts
await print({
  strategy: 'beast',
  beast: {
    mode: 'html',
    widthMm: 80,
    html: `
      <html>
        <body>
          <h1>BeastPrint HTML mode</h1>
          <p>Printed via BeastPrint service.</p>
        </body>
      </html>
    `,
    printer: {
      key: 'YOUR_PRINTER_KEY',
      profileKey: 'epson-tm-m30ii',
    },
  },
});
```

If BeastPrint responds with a non-2xx status, `print` throws an error with the status code and response body text (if available).

---

## Migration patterns

This SDK is designed to make migration from legacy printing to BeastPrint as smooth as possible.

### 1. Start with legacy only

```ts
await print({
  strategy: 'legacy',
  legacy: {
    html: renderLegacyReceipt(order),
  },
});
```

### 2. Move to `auto` with BeastPrint + legacy fallback

```ts
await print({
  strategy: 'auto',
  beast: {
    mode: 'html',
    widthMm: 80,
    html: renderLegacyReceipt(order), // reuse existing template for now
    printer: {
      key: 'YOUR_PRINTER_KEY',
      profileKey: 'epson-tm-m30ii',
    },
  },
  legacy: {
    html: renderLegacyReceipt(order), // fallback if BeastPrint is unavailable
  },
});
```

### 3. Fully switch to BeastPrint templates

```ts
await print({
  strategy: 'beast',
  beast: {
    mode: 'template',
    templateId: 'default-receipt',
    widthMm: 80,
    data: {
      store: { name: 'Guestify' },
      // other template data...
    },
    printer: {
      key: 'YOUR_PRINTER_KEY',
      profileKey: 'epson-tm-m30ii',
    },
  },
});
```

---

## Development

### Build

```bash
npm install
npm run build
```

This produces:

- `dist/index.esm.js` (ESM build)
- `dist/index.cjs` (CommonJS build)
- `dist/index.d.ts` (TypeScript declarations)
- `dist/beastprint.global.global.js` (browser-global IIFE)

### Test harness

A simple static test harness lives under `test/`:

- `test/legacy.html` – tests legacy printing (window.print, iframe).
- `test/global.html` – tests browser global bundle (`window.beastprint.print`).
- `test/beast.html` – tests BeastPrint API; requires a real printer key.

Run a static dev server (using `serve`):

```bash
npm run build
npm run test:server
```

Then open:

- `http://localhost:3000/test/legacy.html`
- `http://localhost:3000/test/global.html`
- `http://localhost:3000/test/beast.html`

Replace `REPLACE_WITH_REAL_PRINTER_KEY` in `test/beast.html` with your actual BeastPrint printer key before testing the cloud endpoint.

---

## License

MIT © Michael Holm
