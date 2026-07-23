import type { OcrWord } from '@/ai/ocrEngine';

export interface OcrCell {
  text: string;
  confidence: number; // 0-100, the lowest word-level confidence merged into this cell (100 for an empty cell)
  lowConfidence: boolean;
  // Numeric cells only — bbox width-per-character notably wider than this
  // table's own baseline, a sign one or more digits were probably dropped
  // or merged during recognition. See the file-level comment on
  // reconstructTable for the real case this exists to catch, which a
  // confidence check alone missed.
  suspiciousWidth: boolean;
}

export interface OcrTable {
  rows: OcrCell[][];
}

const LOW_CONFIDENCE_THRESHOLD = 85;
const WIDTH_ANOMALY_RATIO = 1.4;

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Groups words into rows by vertical position. A real table has a clean gap
// between rows, well bigger than the y-jitter of words within one row —
// sorting by vertical center and starting a new row whenever the gap from
// the running row average exceeds a fraction of the median word height
// exploits that.
function clusterRows(words: OcrWord[]): OcrWord[][] {
  if (words.length === 0) return [];
  const medianHeight = median(words.map((w) => w.bbox.y1 - w.bbox.y0)) || 10;
  const rowGapThreshold = medianHeight * 0.6;

  const sorted = [...words].sort((a, b) => (a.bbox.y0 + a.bbox.y1) / 2 - (b.bbox.y0 + b.bbox.y1) / 2);
  const rows: OcrWord[][] = [];
  let currentRow: OcrWord[] = [];
  let currentRowY = 0;

  for (const word of sorted) {
    const yCenter = (word.bbox.y0 + word.bbox.y1) / 2;
    if (currentRow.length === 0 || Math.abs(yCenter - currentRowY) <= rowGapThreshold) {
      currentRow.push(word);
      currentRowY = currentRow.reduce((sum, w) => sum + (w.bbox.y0 + w.bbox.y1) / 2, 0) / currentRow.length;
    } else {
      rows.push(currentRow);
      currentRow = [word];
      currentRowY = yCenter;
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);
  return rows;
}

// Finds column boundaries from horizontal whitespace shared by every row —
// not just adjacent-word gaps within one row. A single row's local gaps
// aren't reliable: verified against a real schedule (Chef's Warehouse
// Portland, sheet AD-202) that a label like "COOLER - ELEV 1" has up to
// 31px of space around its dash, wider than the 15px gap separating two
// genuinely different columns ("L (Feet)" / "L (Inches)") elsewhere in the
// same table. Unioning every row's word intervals and only splitting where
// NO row has text is the more robust signal — a real column gutter is
// empty in every row, not just some of them. This is still a heuristic,
// not a guarantee (see reconstructTable's caveat) — it can still mis-split
// or mis-merge an ambiguous column on a real sheet; that's why the UI shows
// the source image crop alongside the result rather than presenting this
// as ground truth.
function detectColumnBoundaries(rows: OcrWord[][], gapThreshold: number): [number, number][] {
  const intervals = rows
    .flat()
    .map((w): [number, number] => [w.bbox.x0, w.bbox.x1])
    .sort((a, b) => a[0] - b[0]);
  if (intervals.length === 0) return [];

  const merged: [number, number][] = [];
  for (const [x0, x1] of intervals) {
    const last = merged[merged.length - 1];
    if (last && x0 <= last[1] + gapThreshold) {
      last[1] = Math.max(last[1], x1);
    } else {
      merged.push([x0, x1]);
    }
  }
  return merged;
}

function assignToColumn(word: OcrWord, columns: [number, number][]): number {
  const center = (word.bbox.x0 + word.bbox.x1) / 2;
  let best = 0;
  let bestDist = Infinity;
  columns.forEach(([x0, x1], i) => {
    const dist = center < x0 ? x0 - center : center > x1 ? center - x1 : 0;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  });
  return best;
}

// Reconstructs a 2D table from a flat OCR word list — Tesseract reads
// words, not tables, so a schedule's actual rows/columns have to be
// re-derived from where words physically sit on the page (see
// clusterRows/detectColumnBoundaries).
//
// This is explicitly a DRAFT, not a trusted source of data. Verified
// against a real cold-storage Panel Schedule (Chef's Warehouse Portland —
// see CLAUDE.md): Tesseract read a "Total LF" value of 2108 as "210" (a
// dropped trailing digit, confidence 51 — the low-confidence flag catches
// this one), and separately read a "22" cell as "2" at 93% confidence —
// high enough that confidence alone would have missed it silently. That
// second error was only catchable because its bounding box was nearly
// triple the width of a true single-digit "2" elsewhere in the same
// column, which is what the width-consistency check exists for (checked
// per numeric token, not per cell — column detection can legitimately
// merge adjacent real columns on some sheets, and that merged "2" still
// needed catching). Both flags are best-effort signals, not proof of
// correctness either way — a cell with neither flag set can still be
// wrong, and this function has no way to know that on its own. Column
// splitting itself is approximate too: verified on the same real sheet
// that no single gap threshold can both keep "COOLER - ELEV 1" (up to 31px
// of internal spacing) in one cell and still split "L (Feet)" from
// "L (Inches)" (a genuinely different pair of columns only 15px apart) —
// don't expect pixel-perfect column boundaries out of this. Never wire
// output straight into a takeoff
// item's dimensions or cost; the UI this feeds (OcrTableViewer) always
// shows the source image crop next to the table specifically so a human
// checks every value against the picture before trusting any of it.
export function reconstructTable(words: OcrWord[]): OcrTable {
  if (words.length === 0) return { rows: [] };

  const medianHeight = median(words.map((w) => w.bbox.y1 - w.bbox.y0)) || 10;
  const columnGapThreshold = Math.max(15, medianHeight * 1.5);

  const wordRows = clusterRows(words);
  const columns = detectColumnBoundaries(wordRows, columnGapThreshold);

  const numericWidthsPerChar: number[] = [];
  for (const w of words) {
    if (/^\d+$/.test(w.text)) {
      numericWidthsPerChar.push((w.bbox.x1 - w.bbox.x0) / w.text.length);
    }
  }
  const medianNumericWidthPerChar = median(numericWidthsPerChar);

  const rows: OcrCell[][] = wordRows.map((rowWords) => {
    // A row can have multiple words landing in the same column (e.g.
    // "COOLER" "-" "ELEV" "1" all belong to one Location cell) — group by
    // column first, then join left-to-right within each column.
    const byColumn = new Map<number, OcrWord[]>();
    for (const word of rowWords) {
      const col = assignToColumn(word, columns);
      const bucket = byColumn.get(col) ?? [];
      bucket.push(word);
      byColumn.set(col, bucket);
    }

    return columns.map((_, colIndex) => {
      const cellWords = (byColumn.get(colIndex) ?? []).sort((a, b) => a.bbox.x0 - b.bbox.x0);
      if (cellWords.length === 0) {
        return { text: '', confidence: 100, lowConfidence: false, suspiciousWidth: false };
      }

      const text = cellWords.map((w) => w.text).join(' ');
      const confidence = Math.min(...cellWords.map((w) => w.confidence));
      const lowConfidence = confidence < LOW_CONFIDENCE_THRESHOLD;

      // Checked per numeric *token* within the cell, not just whole
      // single-word cells — column detection can legitimately merge
      // adjacent real columns into one cell on some sheets (see
      // detectColumnBoundaries's comment), and a merged cell like "2 31 0"
      // still needs each of its numbers checked individually. Verified
      // this matters: on the real schedule this was built against, the
      // Qty/L(Feet)/L(Inches) columns merged into one cell for exactly
      // that reason, and a whole-cell-only check would have silently
      // stopped catching the misread digit inside it.
      let suspiciousWidth = false;
      if (medianNumericWidthPerChar > 0) {
        for (const cw of cellWords) {
          if (!/^\d+$/.test(cw.text)) continue;
          const widthPerChar = (cw.bbox.x1 - cw.bbox.x0) / cw.text.length;
          if (widthPerChar > medianNumericWidthPerChar * WIDTH_ANOMALY_RATIO) {
            suspiciousWidth = true;
            break;
          }
        }
      }

      return { text, confidence, lowConfidence, suspiciousWidth };
    });
  });

  return { rows };
}
