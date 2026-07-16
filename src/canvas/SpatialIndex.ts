import type { BoundingBox } from '@/types/takeoff';

interface IndexedEntry {
  id: string;
  bbox: BoundingBox;
}

const CELL_SIZE = 256;

function cellKey(cx: number, cy: number): string {
  return `${cx}:${cy}`;
}

function cellsForBox(bbox: BoundingBox): string[] {
  const minCx = Math.floor(bbox.x / CELL_SIZE);
  const minCy = Math.floor(bbox.y / CELL_SIZE);
  const maxCx = Math.floor((bbox.x + bbox.width) / CELL_SIZE);
  const maxCy = Math.floor((bbox.y + bbox.height) / CELL_SIZE);

  const keys: string[] = [];
  for (let cx = minCx; cx <= maxCx; cx++) {
    for (let cy = minCy; cy <= maxCy; cy++) {
      keys.push(cellKey(cx, cy));
    }
  }
  return keys;
}

// Uniform-grid spatial index over checklist item bounding boxes. Used to look
// up a box by id (for the pan-to/highlight flow) and to hit-test a click
// against nearby items without scanning every item on the page.
export class SpatialIndex {
  private cells = new Map<string, Set<string>>();
  private entries = new Map<string, IndexedEntry>();

  clear() {
    this.cells.clear();
    this.entries.clear();
  }

  rebuild(items: Array<{ id: string; boundingBox: BoundingBox }>) {
    this.clear();
    for (const item of items) {
      this.insert(item.id, item.boundingBox);
    }
  }

  insert(id: string, bbox: BoundingBox) {
    this.remove(id);
    this.entries.set(id, { id, bbox });
    for (const key of cellsForBox(bbox)) {
      let bucket = this.cells.get(key);
      if (!bucket) {
        bucket = new Set();
        this.cells.set(key, bucket);
      }
      bucket.add(id);
    }
  }

  remove(id: string) {
    const entry = this.entries.get(id);
    if (!entry) return;
    for (const key of cellsForBox(entry.bbox)) {
      this.cells.get(key)?.delete(id);
    }
    this.entries.delete(id);
  }

  getBoundingBox(id: string): BoundingBox | undefined {
    return this.entries.get(id)?.bbox;
  }

  queryPoint(x: number, y: number): string[] {
    const candidates = this.cells.get(cellKey(Math.floor(x / CELL_SIZE), Math.floor(y / CELL_SIZE)));
    if (!candidates) return [];

    const hits: string[] = [];
    for (const id of candidates) {
      const entry = this.entries.get(id);
      if (!entry) continue;
      const { bbox } = entry;
      if (x >= bbox.x && x <= bbox.x + bbox.width && y >= bbox.y && y <= bbox.y + bbox.height) {
        hits.push(id);
      }
    }
    return hits;
  }
}
