// Cold-storage room classifications. Ported from estimator-app's
// lib/imp/roomTypes.ts, trimmed to the fields concrete-takeoff-app actually
// uses (dropped canvas stroke/fill colors — this app doesn't render room
// polygons with per-room-type coloring).

export type IMPRoomType = 'blast-freezer' | 'freezer' | 'cooler' | 'cold-dock' | 'ambient' | 'ante-room';

export interface RoomTypeConfig {
  type: IMPRoomType;
  label: string;
  temperature_range: string;
  recommended_panel_thickness: number;
}

export const ROOM_TYPE_CONFIGS: Record<IMPRoomType, RoomTypeConfig> = {
  // [Likely] Unlike the other room types below, no real bid document in
  // this repo's reference-docs/ covers a blast-freezer scope to confirm
  // against — temperature range is standard blast-freezing/IQF-tunnel
  // industry knowledge (-40°F to -10°F, well below standard freezer's
  // -10°F to 0°F), and 8" is a starting-point recommendation (the upper
  // end of this app's own existing freezer thickness range), not a
  // sourced figure — colder duty and higher airflow typically call for at
  // least as much insulation as a standard freezer, often more. Treat as
  // a default to confirm per job, same caveat as the concrete/trim rates
  // ported from estimator-app elsewhere in this app. No IMP_ASSEMBLIES
  // entry exists for this room type (only 5 assemblies exist at all — see
  // data/impAssemblies.ts), so a blast freezer Wall/Ceiling Panel or trim
  // item will correctly show quantity with no cost, same "no fabricated
  // cost" behavior cold-dock and ante-room already have.
  'blast-freezer': {
    type: 'blast-freezer',
    label: 'Blast Freezer',
    temperature_range: '-40°F to -10°F',
    recommended_panel_thickness: 8,
  },
  freezer: {
    type: 'freezer',
    label: 'Freezer',
    temperature_range: '-10°F to 0°F',
    recommended_panel_thickness: 6,
  },
  cooler: {
    type: 'cooler',
    label: 'Cooler',
    temperature_range: '32°F to 40°F',
    recommended_panel_thickness: 4,
  },
  'cold-dock': {
    type: 'cold-dock',
    label: 'Cold Dock',
    temperature_range: '40°F to 50°F',
    recommended_panel_thickness: 4,
  },
  ambient: {
    type: 'ambient',
    label: 'Ambient',
    temperature_range: '50°F+',
    recommended_panel_thickness: 2,
  },
  'ante-room': {
    type: 'ante-room',
    label: 'Ante Room',
    temperature_range: 'Transition',
    recommended_panel_thickness: 4,
  },
};

export function getRoomTypeOptions(): { value: IMPRoomType; label: string }[] {
  return (Object.values(ROOM_TYPE_CONFIGS) as RoomTypeConfig[]).map((c) => ({
    value: c.type,
    label: c.label,
  }));
}