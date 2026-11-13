import type { FC } from 'react';
import type { Seat } from '@/types';
import type { MemberView } from '@/scene/sceneReducer';

export interface Skin {
  Avatar: FC<{
    seat: Seat | 'moderador';
    view: MemberView;
    isSpeaker: boolean;
    speakerPos?: [number, number, number];
    /** o orador está se dirigindo a este membro */
    addressed?: boolean;
    /** posição (-1..1) do orador atual */
    speakerStance?: number;
  }>;
}
