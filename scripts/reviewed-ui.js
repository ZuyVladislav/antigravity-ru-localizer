"use strict";

// Serialized into the renderer. Resolve each frame only when it has one
// possible split, so captured names, paths and errors remain opaque.
function createReviewedTemplateTranslator(specifications, factory) {
  const entries = specifications.map(specification => ({
    parts: specification.source.split("\x24{value}"),
    translate: factory([specification]),
    tooltipOnly: specification.tooltipOnly === true,
  }));

  return function translateReviewedTemplate(value, tooltip = false) {
    if (typeof value !== "string" || value.length > 4000 || /[\r\n]/.test(value)) return null;
    for (const { parts, translate, tooltipOnly } of entries) {
      if (tooltipOnly && !tooltip) continue;
      if (!value.startsWith(parts[0])) continue;
      let states = 0;
      let matches = 0;
      function search(index, position) {
        if (++states > 64) return;
        const fixed = parts[index];
        const end = Math.min(value.length, position + 600);
        if (index === parts.length - 1) {
          const suffix = value.length - fixed.length;
          if (suffix >= position && suffix <= end && value.endsWith(fixed)) matches++;
          return;
        }
        for (let at = value.indexOf(fixed, position); at >= position && at <= end && states <= 64 && matches < 2; at = value.indexOf(fixed, at + 1)) {
          search(index + 1, at + fixed.length);
        }
      }
      search(1, parts[0].length);
      if (states <= 64 && matches === 1) return translate(value);
    }
    return null;
  };
}

function translatePlanChipLabel(value, expanded) {
  if (typeof value !== "string" || (expanded !== "true" && expanded !== "false")) return null;
  const suffix = expanded === "true" ? "Hide plan" : "Show plan";
  if (!value.endsWith(". " + suffix)) return null;
  return value.slice(0, -suffix.length) + (expanded === "true" ? "Скрыть план" : "Показать план");
}

module.exports = { createReviewedTemplateTranslator, translatePlanChipLabel };
