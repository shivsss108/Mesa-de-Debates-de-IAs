import type { FC } from 'react';
import type { Seat } from '@/types';
import type { MemberView } from '@/scene/sceneReducer';
import type { Look } from '@/skins/terno/look';

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
    /** aparência resolvida pela mesa (evita repetições); sem ela a skin usa `lookOf(seat)` */
    look?: Look;
  }>;
}
