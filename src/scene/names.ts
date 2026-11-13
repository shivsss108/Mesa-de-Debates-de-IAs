import { MODERATOR_ID } from '@/types';
import type { DebateConfig } from '@/types';

export const memberName = (c: DebateConfig | undefined, id: string) =>
  id === MODERATOR_ID ? 'Moderador' : (c?.seats.find((s) => s.id === id)?.nome ?? id);
