import type { Skin } from '@/skins/types';
import { TernoAvatar } from './Avatar';

export type { Joint, Pose } from './poses';
export { POSES, GESTURE_DURATION_MS, poseAt } from './poses';
export { listenerReaction } from './reactions';
export { drawFace } from './face';

export const ternoSkin: Skin = { Avatar: TernoAvatar };
