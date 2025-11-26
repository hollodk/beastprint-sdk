"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  print: () => print
});
module.exports = __toCommonJS(src_exports);
async function print(options = {}) {
  var _a;
  const strategy = (_a = options.strategy) != null ? _a : "auto";
  if (strategy === "legacy") {
    return legacyPrint(options.legacy);
  }
  if (strategy === "beast") {
    return beastPrint(options.beast);
  }
  const hasBeastConfig = !!options.beast && !!options.beast.printer && typeof options.beast.printer.key === "string" && options.beast.printer.key.length > 0;
  if (hasBeastConfig) {
    try {
      await beastPrint(options.beast);
      return;
    } catch (err) {
      console.warn("[beastprint] BeastPrint failed, falling back to legacy", err);
    }
  }
  if (options.legacy) {
    return legacyPrint(options.legacy);
  }
  throw new Error("[beastprint] No valid print configuration provided");
}
async function legacyPrint(options) {
  if (!options || !options.html && !options.url) {
    if (typeof window !== "undefined" && typeof window.print === "function") {
      window.print();
      return;
    }
    throw new Error("[beastprint] window.print() is not available");
  }
  if (options.url) {
    if (typeof window === "undefined") {
      throw new Error("[beastprint] Cannot open window in non-browser environment");
    }
    const win = window.open(options.url, "_blank");
    if (!win) {
      throw new Error("[beastprint] Popup blocked or failed to open window");
    }
    win.addEventListener("load", () => {
      try {
        win.focus();
        win.print();
      } catch (err) {
        console.error("[beastprint] Failed to print from opened window", err);
      }
    });
    return;
  }
  if (options.html) {
    if (typeof document === "undefined") {
      throw new Error("[beastprint] Cannot create iframe in non-browser environment");
    }
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.visibility = "hidden";
    document.body.appendChild(iframe);
    const iframeWindow = iframe.contentWindow;
    if (!iframeWindow) {
      iframe.remove();
      throw new Error("[beastprint] Failed to access iframe.contentWindow");
    }
    const doc = iframeWindow.document;
    doc.open();
    doc.write(options.html);
    doc.close();
    iframe.onload = () => {
      try {
        iframeWindow.focus();
        iframeWindow.print();
      } catch (err) {
        console.error("[beastprint] Failed to print from iframe", err);
      } finally {
        setTimeout(() => {
          iframe.remove();
        }, 1e3);
      }
    };
    return;
  }
}
async function beastPrint(options) {
  var _a, _b, _c;
  if (!options) {
    throw new Error("[beastprint] No BeastPrint options provided");
  }
  if (!options.printer || !options.printer.key) {
    throw new Error("[beastprint] printer.key is required for BeastPrint");
  }
  const mode = (_a = options.mode) != null ? _a : "template";
  const body = {
    mode,
    widthMm: (_b = options.widthMm) != null ? _b : 80,
    printer: {
      key: options.printer.key,
      profileKey: options.printer.profileKey
    }
  };
  if (mode === "template") {
    if (!options.templateId) {
      throw new Error('[beastprint] templateId is required when mode="template"');
    }
    body.templateId = options.templateId;
    body.data = (_c = options.data) != null ? _c : {};
  } else if (mode === "html") {
    if (!options.html) {
      throw new Error('[beastprint] html is required when mode="html"');
    }
    body.html = options.html;
  } else {
    throw new Error(`[beastprint] Unsupported mode: ${mode}`);
  }
  const response = await fetch("https://print.beastscan.com/print", {
    method: "POST",
    headers: {
      accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    let errorMessage = `BeastPrint error: ${response.status}`;
    try {
      const text = await response.text();
      if (text) errorMessage += ` - ${text}`;
    } catch {
    }
    throw new Error(errorMessage);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  print
});
//# sourceMappingURL=index.cjs.map