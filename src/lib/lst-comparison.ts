export type TrainingTechnique =
  | "LST"
  | "Topping"
  | "FIM"
  | "SCROG"
  | "Supercropping"
  | "Defoliation"
  | "Lollipopping"
  | "Branch Spreading";

export interface LstComparisonItem {
  id: string;
  title: string;
  plantId?: string;
  plantName?: string;
  technique: TrainingTechnique;
  beforePhoto: string;
  beforeDate: string;
  beforeNote?: string;
  afterPhoto: string;
  afterDate: string;
  afterNote?: string;
  canopyNotes?: string;
  spreadIncreasePercent?: number;
  newShootsExposed?: number;
}

export const LST_COMPARISONS_KEY = "canopy-lst-comparisons-v2";

// Built-in high-quality demonstration comparison so users can see the interactive slider immediately
export const SAMPLE_LST_COMPARISON: LstComparisonItem = {
  id: "sample-lst-demo",
  title: "Main Stem Tie-Down & Lateral Shoot Flare",
  plantName: "Northern Lights #5",
  technique: "LST",
  beforeDate: "2026-10-15",
  beforeNote: "Single apical vertical dominant stalk with lower secondary shoots shaded.",
  afterDate: "2026-10-19",
  afterNote:
    "Main stalk pinned horizontally at rim level. Auxin redistributed to 6 equal top shoots.",
  canopyNotes:
    "4 days after rubber wire tie-down: flat, even table canopy with 100% light exposure.",
  spreadIncreasePercent: 42,
  newShootsExposed: 6,
  // SVG base64 representations of Before & After canopy diagrams for crisp rendering
  beforePhoto:
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 600' width='600' height='600'><rect width='600' height='600' fill='%23131e17'/><circle cx='300' cy='300' r='240' fill='%231c2c22' stroke='%2322c55e' stroke-width='2' stroke-dasharray='6,6'/><rect x='280' y='220' width='40' height='260' rx='10' fill='%233f6212'/><circle cx='300' cy='200' r='55' fill='%2322c55e'/><path d='M300 200 L250 140 A30 30 0 0 1 350 140 Z' fill='%2316a34a'/><circle cx='270' cy='290' r='30' fill='%2315803d'/><circle cx='330' cy='320' r='32' fill='%2315803d'/><circle cx='280' cy='360' r='25' fill='%23166534'/><text x='300' y='520' text-anchor='middle' fill='%2386efac' font-family='sans-serif' font-weight='bold' font-size='20'>BEFORE TRAINING</text><text x='300' y='550' text-anchor='middle' fill='%23a1a1aa' font-family='sans-serif' font-size='14'>Tall single apical stalk · Shaded lower nodes</text></svg>",
  afterPhoto:
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 600' width='600' height='600'><rect width='600' height='600' fill='%230f2316'/><circle cx='300' cy='300' r='240' fill='%231c2c22' stroke='%2322c55e' stroke-width='3'/><path d='M300 460 Q300 340 450 330' fill='none' stroke='%23eab308' stroke-width='6' stroke-dasharray='4,4'/><path d='M300 460 Q300 350 440 340' fill='none' stroke='%234d7c0f' stroke-width='26' stroke-linecap='round'/><circle cx='180' cy='240' r='48' fill='%2322c55e'/><circle cx='250' cy='210' r='50' fill='%2322c55e'/><circle cx='340' cy='210' r='52' fill='%2322c55e'/><circle cx='410' cy='240' r='48' fill='%2322c55e'/><circle cx='230' cy='320' r='46' fill='%2316a34a'/><circle cx='360' cy='310' r='48' fill='%2316a34a'/><circle cx='450' cy='340' r='42' fill='%2316a34a'/><text x='300' y='520' text-anchor='middle' fill='%234ade80' font-family='sans-serif' font-weight='bold' font-size='20'>AFTER LST TIE-DOWN (+4 DAYS)</text><text x='300' y='550' text-anchor='middle' fill='%23cbd5e1' font-family='sans-serif' font-size='14'>Bent horizontal · 6 Colas rising at equal height</text></svg>",
};

export function loadSavedLstComparisons(): LstComparisonItem[] {
  try {
    const raw = localStorage.getItem(LST_COMPARISONS_KEY);
    if (!raw) return [SAMPLE_LST_COMPARISON];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return [SAMPLE_LST_COMPARISON];
  } catch {
    return [SAMPLE_LST_COMPARISON];
  }
}

export function saveLstComparison(item: LstComparisonItem): LstComparisonItem[] {
  const current = loadSavedLstComparisons().filter(
    (x) => x.id !== item.id && x.id !== "sample-lst-demo",
  );
  const updated = [item, ...current];
  try {
    localStorage.setItem(LST_COMPARISONS_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
  return updated;
}

export function deleteLstComparison(id: string): LstComparisonItem[] {
  const current = loadSavedLstComparisons().filter((x) => x.id !== id);
  try {
    localStorage.setItem(LST_COMPARISONS_KEY, JSON.stringify(current));
  } catch {
    // ignore
  }
  return current;
}
