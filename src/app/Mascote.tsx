import { AvatarThumb } from '@/skins/terno/AvatarThumb';
import { lookOf } from '@/skins/terno/look';

/** Motivo visual: o moderador do programa. */
export function Mascote({ size = 64 }: { size?: number }) {
  return <AvatarThumb look={lookOf('moderador')} size={size} />;
}
