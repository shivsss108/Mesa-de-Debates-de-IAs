import type { FC } from 'react';
import type { Seat } from '@/types';
import type { MemberView } from '@/scene/sceneReducer';

export interface Skin {
  Avatar: FC<{ seat: Seat | 'moderador'; view: MemberView; isSpeaker: boolean; speakerPos?: [number, number, number] }>;
}
