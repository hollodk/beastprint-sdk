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

  // NEW: load URL into a hidden iframe and print, instead of opening popup
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
};

export type PrintdeskOptions = {
  printerId: string;
  saleId: string;
  sample: boolean;
  /**
   * The URL of your backend that returns the payload for the local printdesk service.
   * Equivalent to the old `printUrl` in your jQuery example.
   */
  printUrl: string;
  /**
   * URL of the local printdesk endpoint.
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
   * Enable debug logging only for this call.
   * Overrides the global configureDebug() setting for this invocation.
   */
  debug?: boolean;
};

type DebugConfig = {
  enabled?: boolean;
};

let _debugConfig: DebugConfig = {
  enabled: false,
};

export function configureDebug(debug: DebugConfig) {
  _debugConfig = { ..._debugConfig, ...debug };
}

function debugLog(...args: any[]) {
  if (!_debugConfig.enabled) return;
  // namespaced log
  console.log('[beastprint:debug]', ...args);
}

export async function print(options: PrintOptions = {}): Promise<void> {
  const prevDebugConfig = _debugConfig;

  // Per-call debug override, if provided
  if (typeof options.debug === 'boolean') {
    _debugConfig = { ..._debugConfig, enabled: options.debug };
  }

  try {
    const strategy: PrintStrategy = options.strategy ?? 'auto';
    debugLog('print called', { strategy, options });

    if (strategy === 'legacy') {
      debugLog('strategy=legacy → legacyPrint');
      return legacyPrint(options.legacy);
    }

    if (strategy === 'beast') {
      debugLog('strategy=beast → beastPrint');
      return beastPrint(options.beast);
    }

    if (strategy === 'printdesk') {
      debugLog('strategy=printdesk → printdeskPrint');
      return printdeskPrint(options.printdesk);
    }

    // strategy === 'auto'
    const hasBeastConfig =
      !!options.beast &&
      !!options.beast.printer &&
      typeof options.beast.printer.key === 'string' &&
      options.beast.printer.key.length > 0;

    debugLog('strategy=auto', { hasBeastConfig });

    if (hasBeastConfig) {
      try {
        debugLog('auto → trying BeastPrint first');
        await beastPrint(options.beast);
        return;
      } catch (err) {
        // Soft failure, then fallback
        console.warn('[beastprint] BeastPrint failed, falling back to legacy', err);
        debugLog('auto → BeastPrint failed, will try legacy', err);
      }
    }

    if (options.legacy) {
      debugLog('auto → legacy fallback');
      return legacyPrint(options.legacy);
    }

    debugLog('auto → no valid config, throwing');
    throw new Error('[beastprint] No valid print configuration provided');
  } finally {
    // Restore previous debug config after this call
    _debugConfig = prevDebugConfig;
  }
}

function buildLegacyPrintHtml(html: string, options?: LegacyPrintOptions): string {
  const pageWidthMm = options?.pageWidthMm;
  const pageHeightMm = options?.pageHeightMm;
  const marginMm = options?.marginMm ?? 0;
  const hideAppChrome = options?.hideAppChrome ?? true;

  // Build @page rule bits
  const pageRules: string[] = [];
  if (pageWidthMm) {
    pageRules.push(
      `size: ${pageWidthMm}mm${pageHeightMm ? ` ${pageHeightMm}mm` : ''};`
    );
  }
  pageRules.push(`margin: ${marginMm}mm;`);

  // Hide common app chrome elements if requested
  const hideChromeCss = hideAppChrome
    ? `
      header, footer, nav,
      .site-header, .site-footer,
      .app-header, .app-footer {
        display: none !important;
      }
    `
    : '';

  // Detect if user passed a full HTML document
  const hasHtmlTag = /<html[\s>]/i.test(html);

  if (hasHtmlTag) {
    const styleBlock = `
      <style>
        @page {
          ${pageRules.join('\n          ')}
        }
        body {
          margin: 0;
          padding: 0;
        }
        ${hideChromeCss}
      </style>
    `;

    if (/<head[\s>]/i.test(html)) {
      // Inject into existing <head>
      return html.replace(/<head([\s>])/i, `<head$1${styleBlock}`);
    }

    // No <head>, just prepend style
    return styleBlock + html;
  }

  // Fragment: wrap in full document
  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Print</title>
    <style>
      @page {
        ${pageRules.join('\n        ')}
      }
      body {
        margin: 0;
        padding: 0;
      }
      ${hideChromeCss}
    </style>
  </head>
  <body>
    ${html}
  </body>
</html>
`;
}

async function legacyPrint(options?: LegacyPrintOptions): Promise<void> {
  debugLog('legacyPrint called', options);

  // If nothing is specified, just call browser print
  if (!options || (!options.html && !options.url)) {
    debugLog('legacyPrint: no options, using window.print()');
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
      return;
    }
    throw new Error('[beastprint] window.print() is not available');
  }

  // Case: URL printing (popup or iframe)
  if (options.url) {
    debugLog('legacyPrint: URL mode', {
      url: options.url,
      popup: options.popup,
    });

    if (typeof window === 'undefined' || typeof document === 'undefined') {
      throw new Error('[beastprint] Cannot open window/iframe in non-browser environment');
    }

    // If popup explicitly requested, use popup-based printing
    if (options.popup) {
      debugLog('legacyPrint: URL → popup window');
      const features = [
        options.popupWidthPx ? `width=${options.popupWidthPx}` : '',
        options.popupHeightPx ? `height=${options.popupHeightPx}` : '',
      ]
        .filter(Boolean)
        .join(',');

      const win = window.open(options.url, '_blank', features || undefined);
      if (!win) {
        throw new Error('[beastprint] Popup blocked or failed to open window');
      }

      win.addEventListener('load', () => {
        try {
          win.focus();
          win.print();
        } catch (err) {
          console.error('[beastprint] Failed to print from opened window', err);
        }
      });

      return;
    }

    debugLog('legacyPrint: URL → hidden iframe');
    // Load URL into a hidden iframe and print from there
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';

    document.body.appendChild(iframe);

    iframe.onload = () => {
      const iframeWindow = iframe.contentWindow;
      if (!iframeWindow) {
        iframe.remove();
        console.error('[beastprint] Failed to access iframe.contentWindow for URL print');
        return;
      }

      try {
        iframeWindow.focus();
        iframeWindow.print();
      } catch (err) {
        console.error('[beastprint] Failed to print from URL iframe', err);
      } finally {
        setTimeout(() => {
          iframe.remove();
        }, 1000);
      }
    };

    iframe.src = options.url;
    return;
  }

  // Case: HTML string printing
  if (options.html) {
    debugLog('legacyPrint: HTML mode', {
      popup: options.popup,
      pageWidthMm: options.pageWidthMm,
      pageHeightMm: options.pageHeightMm,
      marginMm: options.marginMm,
    });

    if (typeof document === 'undefined') {
      throw new Error('[beastprint] Cannot create iframe in non-browser environment');
    }

    const finalHtml = buildLegacyPrintHtml(options.html, options);

    // Popup mode for HTML (legacy-compatible)
    if (options.popup) {
      debugLog('legacyPrint: HTML → popup window');
      const features = [
        options.popupWidthPx ? `width=${options.popupWidthPx}` : '',
        options.popupHeightPx ? `height=${options.popupHeightPx}` : '',
      ]
        .filter(Boolean)
        .join(',');

      const win = window.open('', '_blank', features || undefined);
      if (!win) {
        throw new Error('[beastprint] Popup blocked or failed to open window');
      }

      win.document.open();
      win.document.write(finalHtml);
      win.document.close();

      win.addEventListener('load', () => {
        try {
          win.focus();
          win.print();
        } catch (err) {
          console.error('[beastprint] Failed to print from opened popup', err);
        } finally {
          // optional auto-close
          setTimeout(() => {
            win.close();
          }, 1000);
        }
      });

      return;
    }

    // Default: iframe-based printing (no visible popup)
    debugLog('legacyPrint: HTML → iframe');
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';

    document.body.appendChild(iframe);

    const iframeWindow = iframe.contentWindow;
    if (!iframeWindow) {
      iframe.remove();
      throw new Error('[beastprint] Failed to access iframe.contentWindow');
    }

    const doc = iframeWindow.document;
    doc.open();
    doc.write(finalHtml);
    doc.close();

    iframe.onload = () => {
      try {
        iframeWindow.focus();
        iframeWindow.print();
      } catch (err) {
        console.error('[beastprint] Failed to print from iframe', err);
      } finally {
        setTimeout(() => {
          iframe.remove();
        }, 1000);
      }
    };

    return;
  }
}

async function printdeskPrint(options?: PrintdeskOptions): Promise<void> {
  debugLog('printdeskPrint called', options);

  if (!options) {
    throw new Error('[beastprint] No Printdesk options provided');
  }

  const { printerId, saleId, sample, printUrl } = options;
  const localUrl = options.localUrl ?? 'http://127.0.0.1:43594/print';

  if (!printerId) {
    throw new Error('[beastprint] Printdesk: printerId is required');
  }
  if (!saleId) {
    throw new Error('[beastprint] Printdesk: saleId is required');
  }
  if (!printUrl) {
    throw new Error('[beastprint] Printdesk: printUrl is required');
  }

  // 1) Call your backend (printUrl) to get the payload
  const qs = new URLSearchParams({
    printer: printerId,
    sale: saleId,
    sample: String(sample),
  });

  const backendResponse = await fetch(`${printUrl}?${qs.toString()}`, {
    method: 'GET',
  });

  if (!backendResponse.ok) {
    let text = '';
    try {
      text = await backendResponse.text();
    } catch {
      // ignore
    }
    throw new Error(
      `[beastprint] Printdesk backend error: ${backendResponse.status}${
        text ? ` - ${text}` : ''
      }`
    );
  }

  let payload: unknown;
  try {
    payload = await backendResponse.json();
  } catch {
    throw new Error(
      '[beastprint] Printdesk: failed to parse backend response as JSON'
    );
  }

  // 2) Send payload to local Printdesk service
  const localResponse = await fetch(localUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!localResponse.ok) {
    let text = '';
    try {
      text = await localResponse.text();
    } catch {
      // ignore
    }
    throw new Error(
      `[beastprint] Local Printdesk error: ${localResponse.status}${
        text ? ` - ${text}` : ''
      }`
    );
  }

  // For now we ignore the local response body and just succeed.
}

async function beastPrint(options?: BeastPrintOptions): Promise<void> {
  debugLog('beastPrint called', options);

  if (!options) {
    throw new Error('[beastprint] No BeastPrint options provided');
  }

  if (!options.printer || !options.printer.key) {
    throw new Error('[beastprint] printer.key is required for BeastPrint');
  }

  const mode = options.mode ?? 'template';

  const body: any = {
    mode,
    widthMm: options.widthMm ?? 80,
    printer: {
      key: options.printer.key,
      profileKey: options.printer.profileKey
    }
  };

  if (mode === 'template') {
    if (!options.templateId) {
      throw new Error('[beastprint] templateId is required when mode="template"');
    }
    body.templateId = options.templateId;
    body.data = options.data ?? {};
  } else if (mode === 'html') {
    if (!options.html) {
      throw new Error('[beastprint] html is required when mode="html"');
    }
    body.html = options.html;
  } else {
    throw new Error(`[beastprint] Unsupported mode: ${mode}`);
  }

  const response = await fetch('https://print.beastscan.com/print', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    let errorMessage = `BeastPrint error: ${response.status}`;
    try {
      const text = await response.text();
      if (text) errorMessage += ` - ${text}`;
    } catch {
      // ignore parse error
    }
    throw new Error(errorMessage);
  }

  // For now, keep API as Promise<void>.
}
