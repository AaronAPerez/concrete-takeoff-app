/**
 * hooks/useAuditedMeasurements.ts
 *
 * Composes useUndoable() + useAuditTrail() into the audited add/update/remove/
 * undo/redo wrappers ConcreteTakeoffApp uses everywhere instead of the raw
 * undoable callbacks — auto-assigning a default pricing assembly on add,
 * stamping created/edited-by ownership, and logging every mutation to the
 * audit trail. Fully hides the raw useUndoable() API from the caller except
 * for three deliberate audit/undo-history bypasses, exposed as-is for their
 * specific call sites: `updateQuiet` (no undo entry — high-frequency vertex-
 * drag preview), `replaceAll` (no undo entry — snapshot/version restore), and
 * `updateSilent` (undo-able, but no audit-log entry — auto-lock-rule patches
 * shouldn't spam the audit trail the way a user edit should).
 */

import { useCallback, useRef } from 'react';
import { useUndoable } from './useUndoable';
import { useAuditTrail, type UseAuditTrailReturn } from './useAuditTrail';
import { useAssemblyStore } from '@/store/assemblyStore';
import { isAssemblyCompatible } from '@/lib/concrete-takeoff/assemblyPricing';
import type { ConcreteMeasurement } from '@/types/concrete-measurement';

export interface UseAuditedMeasurementsReturn {
  allMeasurements: ConcreteMeasurement[];
  add:    (m: ConcreteMeasurement) => void;
  update: (id: string, patch: Partial<ConcreteMeasurement>) => void;
  remove: (id: string) => void;
  undo:   () => void;
  redo:   () => void;
  /** Skips the undo entry AND the audit log — for high-frequency intermediate states (e.g. vertex dragging). */
  updateQuiet: (id: string, patch: Partial<ConcreteMeasurement>) => void;
  /** Skips the undo entry AND the audit log — for wholesale replacement (snapshot/version restore). */
  replaceAll:  (items: ConcreteMeasurement[]) => void;
  /** Pushes an undo entry but skips the audit log — for system-applied patches (e.g. auto-lock rules) that shouldn't read as a user edit. */
  updateSilent: (id: string, patch: Partial<ConcreteMeasurement>) => void;
  canUndo: boolean;
  canRedo: boolean;
  undoDepth: number;
  redoDepth: number;
  audit: UseAuditTrailReturn;
  /** Display name stamped onto created/edited-by fields — mutate `.current` once the real name is known. */
  userNameRef: React.RefObject<string>;
}

export function useAuditedMeasurements(
  activeSheetId: string,
  scalePxPerFt: number,
): UseAuditedMeasurementsReturn {
  const {
    items: allMeasurements,
    add: _add, update: _update, remove: _remove,
    updateQuiet, replaceAll,
    undo: _undo, redo: _redo,
    canUndo, canRedo, undoDepth, redoDepth,
  } = useUndoable();

  const audit = useAuditTrail();

  // Assembly library — used to auto-assign a pricing assembly on draw
  const assemblyLibrary    = useAssemblyStore(s => s.assemblies);
  const assemblyByCategory = useAssemblyStore(s => s.defaultByCategory);

  // Display name ref — keeps add/update wrappers stable without re-creating on name change.
  // Initialised here; overwritten once LOCAL_USER_NAME is available (same render cycle).
  const userNameRef = useRef('Estimator');

  const add = useCallback((m: ConcreteMeasurement) => {
    // Auto-assign the category's default pricing assembly (when compatible) so
    // a drawn measurement is priced in the Bid tab with zero extra clicks.
    // Explicit assemblyId from the caller (or a paste) always wins.
    let assemblyId = m.assemblyId;
    if (!assemblyId) {
      const defaultId = assemblyByCategory[m.category];
      const assembly  = defaultId ? assemblyLibrary.find(a => a.id === defaultId) : undefined;
      if (assembly && isAssemblyCompatible(m.type, assembly.primaryUnit)) {
        assemblyId = assembly.id;
      }
    }

    // Feature 26: stamp ownership fields if not already set by the caller
    const now = new Date().toISOString();
    const withOwner: ConcreteMeasurement = {
      createdBy: userNameRef.current,
      createdAt: now,
      ...m,
      assemblyId,
      // Always the active sheet — even a paste of a measurement copied on
      // another sheet lands on the page the user is looking at.
      sheetId: activeSheetId,
    };
    _add(withOwner);
    audit.logAdd(withOwner, scalePxPerFt);
  }, [_add, audit, scalePxPerFt, activeSheetId, assemblyLibrary, assemblyByCategory]);

  const update = useCallback((id: string, patch: Partial<ConcreteMeasurement>) => {
    // Capture the measurement state BEFORE applying the patch for the diff view.
    // Lookup spans all sheets so cross-sheet callers (e.g. list bulk ops) work.
    const before = allMeasurements.find(m => m.id === id);
    // Stamp edit ownership on every mutation
    const withEdit: Partial<ConcreteMeasurement> = {
      editedBy: userNameRef.current,
      editedAt: new Date().toISOString(),
      ...patch,
    };
    _update(id, withEdit);
    if (before) audit.logUpdate(before, withEdit, scalePxPerFt);
  }, [_update, audit, allMeasurements, scalePxPerFt]);

  const remove = useCallback((id: string) => {
    const m = allMeasurements.find(m => m.id === id);
    _remove(id);
    if (m) audit.logDelete(m);
  }, [_remove, audit, allMeasurements]);

  const undo = useCallback(() => { _undo(); audit.logUndo(); }, [_undo, audit]);
  const redo = useCallback(() => { _redo(); audit.logRedo(); }, [_redo, audit]);

  return {
    allMeasurements, add, update, remove, undo, redo,
    updateQuiet, replaceAll, updateSilent: _update,
    canUndo, canRedo, undoDepth, redoDepth,
    audit, userNameRef,
  };
}
