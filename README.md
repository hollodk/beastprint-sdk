# beastprint-sdk

Unified web printing for:

- **BeastPrint** cloud printing (template or HTML)
- **Printdesk**‑style local printing (HTML to a local agent)
- **Legacy** browser printing (`window.print`, iframe, popup)

The recommended way to use it is:

> `strategy: 'auto'` → **BeastPrint → Printdesk → Legacy**

so you configure one call and the SDK picks the best available path.

---

## Quick start: `strategy: 'auto'`

These are the three most common setup patterns:

- Auto with a **BeastPrint template** (recommended if you have Beast templates).
- Auto with **shared HTML**.
- Auto with a **shared URL**.

### 1. Auto with a BeastPrint template (recommended)

Use this if you have a BeastPrint printer + template and want Printdesk/Legacy as fallback.

```ts
import { print } from 'beastprint-sdk';

await print({
  strategy: 'auto',

  // Optional shared URL that Legacy/Printdesk can fall back to
  url: '/test/print', // or 'https://example.com/printable-receipt'

  beast: {
    // Template mode – primary signal for BeastPrint
    templateId: 'default-receipt',
    widthMm: 80,
    data: {
      store: {
        name: 'My Store',
        address: 'Milk street 4',
        phone: '+4580808080',
      },
      order: {
        number: 123,
        date: '2025-08-12 12:05',
        staff: 'Hanne',
      },
    },
    printer: {
      key: 'YOUR_BEAST_PRINTER_KEY',   // required
      profileKey: 'epson-tm-m30ii',    // optional
    },
  },

  // Optional: Printdesk as second priority (local agent)
  printdesk: {
    // No html/url here; auto will use template or shared html/url when needed
    pdfOptions: {
      // These override internal defaults field-by-field
      pageSize: { width: '58000' }, // keep default height "90000", override width
      copies: 1,
    },
    printer: {
      // Only name is really needed for your agent; others are optional
      name: 'EPSON_TM-m30II',
      // id / description / status can be added if your agent needs them
    },
  },

  // Optional: Legacy as last fallback (browser print)
  legacy: {
    pageWidthMm: 80,
    marginMm: 0,
    hideAppChrome: true,
  },
});
```

**Runtime behavior:**

- **BeastPrint**
  - Uses `beast.templateId`, `beast.data`, and `beast.printer`.
  - If it fails or isn’t configured, auto logs and moves on.

- **Printdesk**
  - If it has no own `html`/`url`, auto renders the Beast template via
    `https://print.beastscan.com/render/html` and uses that HTML.
  - Sends to `printdesk.localUrl` (default `http://127.0.0.1:43594/print`) with payload:
    ```json
    {
      "payload": {
        "html": "<html>…rendered template…</html>",
        "pdfOptions": { "...merged defaults + overrides..." },
        "printer": { "name": "EPSON_TM-m30II" }
      }
    }
    ```

- **Legacy**
  - If needed, renders the same template to HTML and prints via iframe/popup.

---

### 2. Auto with shared HTML

Use this if your app already has the complete HTML.

```ts
import { print } from 'beastprint-sdk';

await print({
  strategy: 'auto',

  // Shared HTML, available to all strategies
  html: `
    <html>
      <body style="font-family: system-ui, sans-serif;">
        <h1>Shared HTML receipt</h1>
        <p>This HTML can be reused by BeastPrint, Printdesk, and Legacy.</p>
      </body>
    </html>
  `,

  // Beast: HTML mode (no templateId) – mode will be inferred as 'html'
  beast: {
    widthMm: 80,
    printer: {
      key: 'YOUR_BEAST_PRINTER_KEY',
      profileKey: 'epson-tm-m30ii',
    },
    // beast.html is optional; auto injects shared html when mode is html
  },

  // Printdesk: auto will inject shared html into printdesk.html if empty
  printdesk: {
    pdfOptions: {
      copies: 1,
    },
    printer: {
      name: 'EPSON_TM-m30II',
    },
  },

  legacy: {
    pageWidthMm: 80,
    marginMm: 0,
    hideAppChrome: true,
  },
});
```

**Behavior:**

- **BeastPrint**
  - No `templateId`, but html present → auto uses HTML mode and sends the shared HTML to Beast.
- **Printdesk**
  - If Beast is not used / fails, auto sets `printdesk.html` from shared HTML and sends it.
- **Legacy**
  - As a final fallback, prints the same HTML via iframe/popup.

---

### 3. Auto with shared URL

Use this if you already have a hosted “printable” page.

```ts
import { print } from 'beastprint-sdk';

await print({
  strategy: 'auto',

  // Shared URL that returns printable HTML
  url: 'https://example.com/receipt/123',

  // BeastPrint: HTML mode via URL – auto injects shared url into beast.url
  beast: {
    widthMm: 80,
    printer: {
      key: 'YOUR_BEAST_PRINTER_KEY',
      profileKey: 'epson-tm-m30ii',
    },
    // beast.url can be omitted; auto will set beast.url = options.url
  },

  // Printdesk: will use html/url from its own fields or shared url
  printdesk: {
    // printdesk.url can be omitted; auto will set it from options.url if needed
    pdfOptions: {
      copies: 1,
    },
    printer: {
      name: 'EPSON_TM-m30II',
    },
  },

  // Legacy: URL-based browser printing as last fallback
  legacy: {
    // If everything else fails, legacy will open/print this URL (popup/iframe)
    hideAppChrome: true,
  },
});
```

**Behavior:**

- **BeastPrint**
  - `beast.url` comes from `options.url`; Beast fetches and prints as HTML.
- **Printdesk**
  - If it needs HTML and has none, it fetches the same URL to get HTML.
- **Legacy**
  - If needed, opens the URL in an iframe or popup and triggers `window.print()`.

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

## API overview

### `print(options?: PrintOptions): Promise<void>`

Top-level function that routes print jobs to:

- **BeastPrint** (cloud API)
- **Printdesk** (local agent)
- **Legacy** (browser)

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

  // Load URL into a hidden iframe and print, instead of opening popup
  urlInIframe?: boolean;
};

export type BeastPrintPrinter = {
  key: string;
  profileKey?: string;
};

export type BeastPrintOptions = {
  mode?: 'template' | 'html'; // auto-inferred if not set
  templateId?: string;
  widthMm?: number;
  data?: Record<string, any>;
  printer?: BeastPrintPrinter;
  html?: string;   // used when mode === 'html'
  url?: string;    // URL to fetch HTML from when mode === 'html'
};

export type PrintdeskPdfOptions = {
  margins?: {
    marginType?: number;
  };
  pageSize?: {
    height?: string;
    width?: string;
  };
  color?: boolean;
  copies?: number;
  scaleFactor?: string;
  landscape?: boolean;
  dpi?: string;
};

export type PrintdeskPrinter = {
  name: string;
  description?: string;
  id?: string;
  status?: string;
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

  /**
   * Optional PDF options forwarded to the Printdesk agent.
   * These override the built‑in defaults on a per-field basis.
   */
  pdfOptions?: PrintdeskPdfOptions;

  /**
   * Optional printer selection for the agent.
   * If omitted, the agent's own default printer is used.
   */
  printer?: PrintdeskPrinter;
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
   * If true, non-legacy strategies (beast, printdesk, auto) will fall back to
   * legacy printing instead of throwing, when possible.
   * (Explicit 'legacy' strategy is never affected.)
   */
  fallbackToLegacyOnError?: boolean;
};
```

---

## How `strategy: 'auto'` works (details)

High-level, `auto` tries:

> **BeastPrint → Printdesk → Legacy**

using these priorities.

### BeastPrint (first priority)

Configured if:

- `beast.printer.key` is a non-empty string.

Priority:

1. If `beast.templateId` is set:
   - Template mode (regardless of `mode`): sends:
     ```json
     {
       "mode": "template",
       "templateId": "...",
       "widthMm": 80,
       "data": { "...data..." },
       "printer": { "key": "...", "profileKey": "..." }
     }
     ```

2. Else, HTML mode:
   - `mode` is auto-chosen if not set:
     - If `html` or `url` exists → `'html'`
     - Otherwise `'template'` (and fails without `templateId`).
   - In HTML mode:
     1. `beast.html` (or shared `html` injected earlier).
     2. `beast.url` (or shared `url` injected earlier), fetched as HTML.
   - Sends:
     ```json
     {
       "mode": "html",
       "content": "<!doctype html>..."
     }
     ```

If BeastPrint fails, auto logs and continues to Printdesk.

### Printdesk (second priority)

Configuration sources in `auto`:

1. `printdesk.html`
2. `printdesk.url`
3. `beast.templateId` → rendered to HTML via Beast `/render/html`
4. shared `html` (`options.html`)
5. shared `url` (`options.url`)

In `auto`, when Printdesk is considered usable, it fills `printdeskOpts` like:

- Prefer existing `printdesk.html`.
- Else existing `printdesk.url` (or shared `url` already injected).
- If still no html and Beast has template:
  - Render template to HTML and set `printdesk.html`.
- If still no html and shared `html` exists:
  - Set `printdesk.html = sharedHtml`.
- If still no url and shared `url` exists:
  - Set `printdesk.url = sharedUrl`.

`printdeskPrint` then:

- Uses `options.html` if present.
- Else fetches `options.url` as HTML.
- Merges `pdfOptions` with defaults:

  ```ts
  const defaultPdfOptions: PrintdeskPdfOptions = {
    margins: { marginType: 0 },
    pageSize: { height: '90000', width: '90000' },
    color: false,
    copies: 1,
    scaleFactor: '100',
    landscape: false,
    dpi: '300',
  };
  ```

- Sends to `localUrl` (default `http://127.0.0.1:43594/print`) as:

  ```json
  {
    "payload": {
      "html": "<html>…</html>",
      "pdfOptions": { "...merged..." },
      "printer": { "name": "EPSON_TM-m30II" }
    }
  }
  ```

If Printdesk fails, auto logs and continues to Legacy.

### Legacy (third priority)

Configuration sources:

1. `legacy.html`
2. `legacy.url`
3. `beast.templateId` → rendered to HTML if `html` is missing
4. shared `html` (`options.html`)
5. shared `url` (`options.url`)

In `auto`:

- If `legacy` is present or shared html/url exists, it builds `legacyOpts`:
  - Fill `html` from `legacy.html` or shared `html`.
  - Fill `url` from `legacy.url` or shared `url`.
- If no `legacy.html` and Beast has template:
  - Render template HTML into `legacyOpts.html`.

`legacyPrint` then prefers:

1. HTML printing (iframe or popup) if `html` is present.
2. Else URL printing:
   - popup vs iframe based on `popup` and same-origin checks.

If none of Beast/Printdesk/Legacy is usable, `auto` throws an error explaining that no usable configuration was found.

---

## Debug logging

Enable global debug logs:

```ts
import { print, configureDebug } from 'beastprint-sdk';

configureDebug({ enabled: true });

await print({ strategy: 'auto', /* ... */ });
```

Or per-call:

```ts
await print({ strategy: 'auto', debug: true, /* ... */ });
```

Logs show the decision flow, for example:

```text
[beastprint:debug] print called { strategy: 'auto', ... }
[beastprint:debug] auto: beast configuration check { hasBeastConfig: true, ... }
[beastprint:debug] auto → trying BeastPrint first
[beastprint:debug] auto → BeastPrint failed ...
[beastprint:debug] auto: printdesk configuration check { hasPrintdeskConfig: true, ... }
[beastprint:debug] auto → trying Printdesk next
[beastprint:debug] auto → Printdesk succeeded
```

---

## Other usage modes

You can still call the explicit strategies directly:

- `strategy: 'legacy'` – only browser printing.
- `strategy: 'beast'` – BeastPrint only.
- `strategy: 'printdesk'` – local agent only.

The test harness (`test/index.html`) contains working examples of these explicit modes.

---

## Development

```bash
npm install
npm run build
npm run test:server
# then open http://localhost:3000/test/index.html
```

---

## License

MIT © Michael Holm
