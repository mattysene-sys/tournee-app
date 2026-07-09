// src/settings/segmentation.js
//
// ============================================================
// CONFIGURATION SEGMENTATION CLIENT & PRESSION COMMERCIALE
// ============================================================
// Ce fichier est le SEUL endroit à modifier pour adapter l'app
// à une autre société : ses propres tiers de clients (noms et
// ordre de priorité) et ses propres niveaux de pression de visite.
// Aucun autre fichier du projet ne doit contenir ces valeurs en dur.
// ============================================================

export const SEGMENTATION_TIERS = [
  { value: "COMPTE CLE",  score: 8, premium: true,  suggestible: true },
  { value: "PLATINIUM",   score: 7, premium: true,  suggestible: true },
  { value: "GOLD",        score: 6, premium: true,  suggestible: true },
  { value: "SILVER",      score: 5, premium: false, suggestible: true },
  { value: "BRONZE",      score: 4, premium: false, suggestible: true },
  { value: "PROSPECTS 1", score: 3, premium: false, suggestible: true },
  { value: "PROSPECTS 2", score: 2, premium: false, suggestible: false },
  { value: "PROSPECTS 3", score: 1, premium: false, suggestible: false },
];

export const PRESSION_NIVEAUX = [
  { value: "Rouge",  score: 3, color: "var(--rouge)",  colorHex: "#C75450" },
  { value: "Orange", score: 2, color: "var(--orange)", colorHex: "#E8714A" },
  { value: "Vert",   score: 1, color: "var(--vert)",   colorHex: "#5B8C6E" },
];

// --- Dérivés automatiquement, ne pas modifier à la main ---
export const CIBLAGE_SCORE = Object.fromEntries(SEGMENTATION_TIERS.map(t => [t.value, t.score]));
export const CIBLAGE_OPTIONS = SEGMENTATION_TIERS.map(t => t.value);
export const CIBLAGE_ELIGIBLE_SUGGESTIONS = SEGMENTATION_TIERS.filter(t => t.suggestible).map(t => t.value);
export const CIBLAGE_OK = CIBLAGE_ELIGIBLE_SUGGESTIONS;
export const CIBLAGE_PREMIUM = SEGMENTATION_TIERS.filter(t => t.premium).map(t => t.value);

export const PRESSION_SCORE = Object.fromEntries(PRESSION_NIVEAUX.map(p => [p.value, p.score]));
// Pour usage dans du CSS avec variables (--rouge, --orange, --vert définies globalement)
export const PRESSION_COLOR = Object.fromEntries(PRESSION_NIVEAUX.map(p => [p.value, p.color]));
// Pour usage dans des composants qui n'ont pas accès aux variables CSS globales (styles inline isolés)
export const PRESSION_COLOR_HEX = Object.fromEntries(PRESSION_NIVEAUX.map(p => [p.value, p.colorHex]));
