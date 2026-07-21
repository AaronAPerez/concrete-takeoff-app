// Cold-storage room classifications. Ported from estimator-app's
// lib/imp/roomTypes.ts, trimmed to the fields concrete-takeoff-app actually
// uses (dropped canvas stroke/fill colors — this app doesn't render room
// polygons with per-room-type coloring).

export type IMPRoomType = 'freezer' | 'cooler' | 'cold-dock' | 'ambient' | 'ante-room';

export interface RoomTypeConfig {
  type: IMPRoomType;
  label: string;
  temperature_range: string;
  recommended_panel_thickness: number;
}

export const ROOM_TYPE_CONFIGS: Record<IMPRoomType, RoomTypeConfig> = {
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