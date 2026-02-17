/**
 * Canonical gesture mapping for direction_key → gesture_action.
 * Used for event logging (POST /events) when type=gesture, event=gesture_commit.
 * Client should send these exact direction_key values; gesture_action is the display label.
 */
export const GESTURE_DIRECTIONS = [
  { direction_key: "up", gesture_action: "Next" },
  { direction_key: "down", gesture_action: "Previous" },
  { direction_key: "left", gesture_action: "Back" },
  { direction_key: "right", gesture_action: "Same topic" },
  { direction_key: "upLeft", gesture_action: "Restart" },
  { direction_key: "upRight", gesture_action: "Same category" },
  { direction_key: "downLeft", gesture_action: "Inform" },
  { direction_key: "downRight", gesture_action: "Same subject" },
] as const;

export type DirectionKey = (typeof GESTURE_DIRECTIONS)[number]["direction_key"];
export type GestureAction = (typeof GESTURE_DIRECTIONS)[number]["gesture_action"];

export const DIRECTION_KEYS: DirectionKey[] = GESTURE_DIRECTIONS.map((g) => g.direction_key);
export const GESTURE_ACTION_BY_DIRECTION: Record<DirectionKey, GestureAction> = Object.fromEntries(
  GESTURE_DIRECTIONS.map((g) => [g.direction_key, g.gesture_action])
) as Record<DirectionKey, GestureAction>;
