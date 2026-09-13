// Ambient declarations for side-effect asset imports Plasmo's template doesn't
// cover. Without these, `noUncheckedSideEffectImports` (TS 5.6+) errors on
// imports like `./popup.tailwind.css`.
declare module "*.css";
