export const REALTIME_CHANNEL = 'lyceg';
export type RealtimeEvent =
  | 'request:new'
  | 'request:update'
  | 'form:update'
  | 'emails:update'
  | 'admins:update'
  | 'stock:update'
  | 'postos:update'
  | 'purchase:new'
  | 'purchase:update'
  | 'order:new'
  | 'order:update'
  | 'note:update'
  | 'collab:update'
  | 'frota:update';
