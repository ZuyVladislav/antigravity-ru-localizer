"use strict";

// Compile only reviewed fixed UI frames. Captured values are opaque text.
// This factory is serialized into the renderer and must have no Node dependencies.
function createUiTemplateTranslator(specifications) {
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const compiled = specifications.map(item => {
    const parts = item.source.split("${value}");
    const slots = parts.length - 1;
    if (slots < 1 || slots > 8 || !["ui", "activity"].includes(item.scope || "ui")) throw new Error("Invalid reviewed UI template");
    const references = [...item.translation.matchAll(/\$\{([0-9]+)\}/g)].map(match => Number(match[1]));
    if (references.length !== slots || new Set(references).size !== slots || references.some(index => index >= slots)) throw new Error("UI template must preserve every captured value exactly once");
    return { expression: new RegExp("^" + parts.map(escape).join("([^\\r\\n]{0,600}?)") + "$"), translation: item.translation, scope: item.scope || "ui", fixedLength: parts.join("").length };
  }).sort((left, right) => right.fixedLength - left.fixedLength);
  return function translateUiTemplate(value, scope = "ui") {
    if (typeof value !== "string" || value.length > 4000 || /[\r\n]/.test(value)) return null;
    for (const item of compiled) {
      if (item.scope !== scope) continue;
      const match = item.expression.exec(value);
      if (match) return item.translation.replace(/\$\{([0-9]+)\}/g, (_, index) => match[Number(index) + 1]);
    }
    return null;
  };
}

module.exports = createUiTemplateTranslator;
