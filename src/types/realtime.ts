export type RealtimeEvent =
  | { type: 'participants_updated'; eventId: string }
  | { type: 'teams_updated'; eventId: string }
  | { type: 'assignments_updated'; teamId: string }
  | { type: 'positions_updated'; teamId: string }
  | { type: 'flags_updated'; eventId: string };


