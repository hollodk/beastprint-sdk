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
   * If true, non-legacy strategies (beast, printdesk, auto) will fall back to
   * legacy printing instead of throwing, when possible.
   * (Explicit 'legacy' strategy is never affected.)
   */
  fallbackToLegacyOnError?: boolean;
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
    const fallbackToLegacy = options.fallbackToLegacyOnError === true;

    const sharedHtml = options.html;
    const sharedUrl = options.url;

    // Normalize legacy options and inject shared html/url if needed
    const legacyOpts: LegacyPrintOptions | undefined = options.legacy
      ? { ...options.legacy }
      : sharedHtml || sharedUrl
      ? { html: sharedHtml, url: sharedUrl }
      : undefined;

    if (legacyOpts && sharedHtml && !legacyOpts.html) {
      legacyOpts.html = sharedHtml;
    }
    if (legacyOpts && sharedUrl && !legacyOpts.url) {
      legacyOpts.url = sharedUrl;
    }

    // Normalize beast options and inject shared html if needed
    const beastOpts: BeastPrintOptions | undefined = options.beast
      ? { ...options.beast }
      : sharedHtml
      ? { mode: 'html', html: sharedHtml }
      : undefined;

    if (beastOpts && sharedHtml && beastOpts.mode === 'html' && !beastOpts.html) {
      beastOpts.html = sharedHtml;
    }
    // If beast.url is not set but shared url exists, use shared url
    if (beastOpts && sharedUrl && beastOpts.url == null) {
      beastOpts.url = sharedUrl;
    }

    const printdeskOpts: PrintdeskOptions | undefined = options.printdesk
      ? { ...options.printdesk }
      : undefined;

    // If printdesk.url is not set but shared url exists, use shared url
    if (printdeskOpts && sharedUrl && printdeskOpts.url == null) {
      printdeskOpts.url = sharedUrl;
    }

    debugLog('print called', {
      strategy,
      fallbackToLegacy,
      sharedHtml: !!sharedHtml,
      sharedUrl: !!sharedUrl,
      legacyOpts,
      beastOpts,
      printdeskOpts,
    });

    // If beast has a templateId, we can reuse its rendered HTML for Printdesk/Legacy
    const beastHasTemplate = !!beastOpts?.templateId;

    let renderedTemplateHtml: string | undefined;
    const ensureRenderedTemplateHtml = async (): Promise<string | undefined> => {
      if (!beastHasTemplate) return undefined;
      if (renderedTemplateHtml != null) return renderedTemplateHtml;
      renderedTemplateHtml = await renderTemplateToHtml(
        beastOpts!.templateId!,
        beastOpts!.widthMm,
        beastOpts!.data
      );
      debugLog('print: rendered template HTML from beast.templateId for reuse', {
        templateId: beastOpts!.templateId,
      });
      return renderedTemplateHtml;
    };

    // Helper to optionally fallback to legacy
    const maybeFallbackToLegacy = async (err: unknown) => {
      if (!fallbackToLegacy || !legacyOpts) {
        debugLog(
          'no legacy fallback configured or no legacy options; rethrowing error from strategy',
          err
        );
        throw err;
      }
      console.warn(
        '[beastprint] Strategy failed, falling back to legacy due to fallbackToLegacyOnError=true',
        err
      );
      debugLog('falling back to legacyPrint because fallbackToLegacyOnError=true', err);
      return legacyPrint(legacyOpts);
    };

    // Explicit strategies

    if (strategy === 'legacy') {
      debugLog('strategy=legacy → legacyPrint', { legacyOpts });

      // If legacy has no html but beast has a template, render and reuse it
      if (legacyOpts && !legacyOpts.html && beastHasTemplate) {
        const html = await ensureRenderedTemplateHtml();
        if (html) {
          legacyOpts.html = html;
        }
      }

      return legacyPrint(legacyOpts);
    }

    if (strategy === 'beast') {
      debugLog('strategy=beast → beastPrint', { beastOpts });
      try {
        return await beastPrint(beastOpts);
      } catch (err) {
        debugLog('beastPrint threw error (explicit strategy)', err);
        return maybeFallbackToLegacy(err);
      }
    }

    if (strategy === 'printdesk') {
      debugLog('strategy=printdesk → printdeskPrint', { printdeskOpts });

      // If printdesk has no html but beast has a template, render and reuse it
      if (printdeskOpts && !printdeskOpts.html && beastHasTemplate) {
        const html = await ensureRenderedTemplateHtml();
        if (html) {
          printdeskOpts.html = html;
        }
      }

      try {
        return await printdeskPrint(printdeskOpts);
      } catch (err) {
        debugLog('printdeskPrint threw error (explicit strategy)', err);
        return maybeFallbackToLegacy(err);
      }
    }

    // Smart auto: Beast → Printdesk → Legacy
    debugLog('strategy=auto starting');

    // 1) Try BeastPrint if minimally configured
    const hasBeastConfig =
      !!beastOpts &&
      !!beastOpts.printer &&
      typeof beastOpts.printer.key === 'string' &&
      beastOpts.printer.key.length > 0;

    debugLog('auto: beast configuration check', { hasBeastConfig, beastOpts });

    if (hasBeastConfig) {
      try {
        debugLog('auto → trying BeastPrint first');
        await beastPrint(beastOpts);
        debugLog('auto → BeastPrint succeeded');
        return;
      } catch (err) {
        console.warn('[beastprint] auto: BeastPrint failed, will try next strategy', err);
        debugLog('auto → BeastPrint failed', err);
        // continue to Printdesk
      }
    } else {
      debugLog('auto → BeastPrint skipped (missing or incomplete beast options)');
    }

    // 2) Try Printdesk if minimally configured
    const hasPrintdeskConfig =
      !!printdeskOpts &&
      (
        (typeof printdeskOpts.html === 'string' && printdeskOpts.html.length > 0) ||
        (typeof printdeskOpts.url === 'string' && printdeskOpts.url.length > 0)
      );

    debugLog('auto: printdesk configuration check', { hasPrintdeskConfig, printdeskOpts });

    if (hasPrintdeskConfig) {
      try {
        debugLog('auto → trying Printdesk next');

        // If printdesk has no html but beast has a template, render and reuse it
        if (printdeskOpts && !printdeskOpts.html && beastHasTemplate) {
          const html = await ensureRenderedTemplateHtml();
          if (html) {
            printdeskOpts.html = html;
          }
        }

        await printdeskPrint(printdeskOpts);
        debugLog('auto → Printdesk succeeded');
        return;
      } catch (err) {
        console.warn('[beastprint] auto: Printdesk failed, will try legacy if available', err);
        debugLog('auto → Printdesk failed', err);
        // fall through to legacy
      }
    } else {
      debugLog('auto → Printdesk skipped (missing or incomplete printdesk options)');
    }

    // 3) Finally, try Legacy if provided or derived
    if (legacyOpts) {
      debugLog('auto → using legacy fallback (legacy options present)', { legacyOpts });

      // If legacy has no html but beast has a template, render and reuse it
      if (!legacyOpts.html && beastHasTemplate) {
        const html = await ensureRenderedTemplateHtml();
        if (html) {
          legacyOpts.html = html;
        }
      }

      return legacyPrint(legacyOpts);
    }

    // 4) Nothing usable
    debugLog('auto → no usable configuration found (no beast/printdesk/legacy)');
    throw new Error(
      '[beastprint] auto strategy: no usable configuration for beast, printdesk, or legacy'
    );
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

    const url = options.url;

    // Detect if the URL is same-origin with the current page
    const isSameOrigin =
      typeof window !== 'undefined' &&
      (() => {
        try {
          const u = new URL(url, window.location.href);
          return u.origin === window.location.origin;
        } catch {
          return false;
        }
      })();

    // If popup explicitly requested, use popup-based printing regardless of origin
    if (options.popup) {
      debugLog('legacyPrint: URL → popup window', { url, isSameOrigin });
      const features = [
        options.popupWidthPx ? `width=${options.popupWidthPx}` : '',
        options.popupHeightPx ? `height=${options.popupHeightPx}` : '',
      ]
        .filter(Boolean)
        .join(',');

      const win = window.open(url, '_blank', features || undefined);
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

    // Non-popup URL mode
    if (!isSameOrigin) {
      // We cannot safely call iframeWindow.print() on a cross-origin URL.
      debugLog(
        'legacyPrint: URL is cross-origin; opening in new tab without programmatic print',
        { url }
      );
      console.warn(
        `[beastprint] legacyPrint: URL "${url}" is cross-origin; cannot print via hidden iframe. ` +
          'Opening in a new tab instead. User must trigger print manually.'
      );

      const win = window.open(url, '_blank');
      if (!win) {
        throw new Error('[beastprint] Popup blocked or failed to open window');
      }
      return;
    }

    // Same-origin: load URL into a hidden iframe and print from there
    debugLog('legacyPrint: URL → hidden iframe (same-origin)', { url });
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

    iframe.src = url;
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

  const localUrl = options.localUrl ?? 'http://127.0.0.1:43594/print';

  // Priority:
  // 1) options.html
  // 2) options.url (fetch HTML from URL)
  let html = options.html;

  if (!html && options.url) {
    debugLog('printdeskPrint: fetching HTML from url', options.url);
    const res = await fetch(options.url);
    if (!res.ok) {
      let text = '';
      try {
        text = await res.text();
      } catch {
        // ignore
      }
      throw new Error(
        `[beastprint] Printdesk: failed to fetch HTML from url: ${res.status}${
          text ? ` - ${text}` : ''
        }`
      );
    }
    html = await res.text();
  }

  if (!html) {
    throw new Error(
      '[beastprint] Printdesk: html or url (or shared html/url) is required'
    );
  }

  // Send HTML to the local Printdesk endpoint.
  // If your agent expects a different payload, adjust this object.
  const payload = { html };

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

async function renderTemplateToHtml(
  templateId: string,
  widthMm: number | undefined,
  data: Record<string, any> | undefined
): Promise<string> {
  const body = {
    mode: 'template',
    templateId,
    widthMm: widthMm ?? 80,
    data: data ?? {},
  };

  debugLog('renderTemplateToHtml: rendering via BeastPrint', body);

  const response = await fetch('https://print.beastscan.com/render/html', {
    method: 'POST',
    headers: {
      accept: 'text/html',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let text = '';
    try {
      text = await response.text();
    } catch {
      // ignore
    }
    throw new Error(
      `[beastprint] renderTemplateToHtml error: ${response.status}${
        text ? ` - ${text}` : ''
      }`
    );
  }

  const html = await response.text();
  return html;
}

/**
 * Public helper: render a BeastPrint template to HTML.
 * This can be used to feed the resulting HTML into legacy or Printdesk printing.
 */
export async function renderTemplateHtml(
  templateId: string,
  widthMm?: number,
  data?: Record<string, any>
): Promise<string> {
  return renderTemplateToHtml(templateId, widthMm, data);
}

async function beastPrint(options?: BeastPrintOptions): Promise<void> {
  debugLog('beastPrint called', options);

  if (!options) {
    throw new Error('[beastprint] No BeastPrint options provided');
  }

  if (!options.printer || !options.printer.key) {
    throw new Error('[beastprint] printer.key is required for BeastPrint');
  }

  // If templateId is set, template mode wins over everything else
  // Regardless of options.mode, we treat this as template print.
  if (options.templateId) {
    const body: any = {
      mode: 'template',
      widthMm: options.widthMm ?? 80,
      templateId: options.templateId,
      data: options.data ?? {},
      printer: {
        key: options.printer.key,
        profileKey: options.printer.profileKey,
      },
    };

    const response = await fetch('https://print.beastscan.com/print', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
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
    return;
  }

  // Otherwise, we honor mode, defaulting to 'template' if unset
  const mode = options.mode ?? 'template';

  const baseBody: any = {
    mode,
    widthMm: options.widthMm ?? 80,
    printer: {
      key: options.printer.key,
      profileKey: options.printer.profileKey,
    },
  };

  if (mode === 'template') {
    // No templateId given but mode='template': must fail explicitly
    throw new Error(
      '[beastprint] templateId is required when mode="template" and no shared templateId is provided'
    );
  } else if (mode === 'html') {
    // Priority within HTML mode (after templateId check above):
    // 1) options.html (could be from beast.html or shared html injected in print())
    // 2) options.url (could be from beast.url or shared url injected in print())

    let html = options.html;

    if (!html && options.url) {
      debugLog('beastPrint: fetching HTML from url', options.url);
      const res = await fetch(options.url);
      if (!res.ok) {
        let text = '';
        try {
          text = await res.text();
        } catch {
          // ignore
        }
        throw new Error(
          `[beastprint] Failed to fetch HTML from url: ${res.status}${
            text ? ` - ${text}` : ''
          }`
        );
      }
      html = await res.text();
    }

    if (!html) {
      throw new Error(
        '[beastprint] html or url is required when mode="html" and no templateId is set'
      );
    }

    const body = {
      ...baseBody,
      // API expects the HTML payload in `content`, not `html`
      content: html,
    };

    const response = await fetch('https://print.beastscan.com/print', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
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
    return;
  } else {
    throw new Error(`[beastprint] Unsupported mode: ${mode}`);
  }
}
