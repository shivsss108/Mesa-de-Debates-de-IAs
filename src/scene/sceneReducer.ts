import { MODERATOR_ID } from '@/types';
import type { DebateConfig, DebateEvent, Emotion, Gesture, HandEntry } from '@/types';

export interface MemberView {
  id: string;
  emotion: Emotion;
  gesture?: { name: Gesture; at: number };
  stance: number;
  status: 'pensando' | 'sem_sinal' | 'ok';
  handUp: boolean;
}

export interface SceneState {
  config?: DebateConfig;
  members: Record<string, MemberView>;
  speaker?: string;
  addressedTo?: string;
  bubble: string;
  transcript: { speaker: string; text: string }[];
  hands: HandEntry[];
  memberTurns: number;
  summary: string;
  ended?: Extract<DebateEvent, { type: 'debate_end' }>;
  error?: string;
}

export const initialScene: SceneState = { members: {}, bubble: '', transcript: [], hands: [], memberTurns: 0, summary: '' };

const newMember = (id: string): MemberView => ({ id, emotion: 'neutro', stance: 0, status: 'ok', handUp: false });

function patch(s: SceneState, id: string, p: Partial<MemberView>): SceneState {
  return { ...s, members: { ...s.members, [id]: { ...(s.members[id] ?? newMember(id)), ...p } } };
}

export function sceneReducer(s: SceneState, e: DebateEvent): SceneState {
  switch (e.type) {
    case 'debate_start':
      return {
        ...initialScene,
        config: e.config,
        members: Object.fromEntries([MODERATOR_ID, ...e.config.seats.map((x) => x.id)].map((id) => [id, newMember(id)])),
      };
    case 'turn_start':
      return { ...s, speaker: e.speaker, addressedTo: e.addressedTo, bubble: '' };
    case 'token':
      return { ...s, bubble: s.bubble + e.text };
    case 'turn_end':
      return {
        ...s,
        bubble: '',
        transcript: [...s.transcript, { speaker: e.speaker, text: e.fullText }],
        memberTurns: e.speaker === MODERATOR_ID ? s.memberTurns : s.memberTurns + 1,
      };
    case 'emotion':
      return patch(s, e.member, { emotion: e.emotion });
    case 'gesture':
      return patch(s, e.member, { gesture: { name: e.gesture, at: e.t } });
    case 'stance':
      return patch(s, e.member, { stance: e.value });
    case 'status': {
      const next = patch(s, e.member, { status: e.state });
      return e.reason ? { ...next, transcript: [...next.transcript, { speaker: e.member, text: `(não respondeu: ${e.reason})` }] } : next;
    }
    case 'hands': {
      const up = new Set(e.queue.map((h) => h.member));
      const members = Object.fromEntries(Object.entries(s.members).map(([id, m]) => [id, { ...m, handUp: up.has(id) }]));
      return { ...s, hands: e.queue, members };
    }
    case 'summary_update':
      return { ...s, summary: e.text };
    case 'debate_end':
      return { ...s, ended: e, speaker: undefined, addressedTo: undefined, bubble: '' };
    case 'error':
      return { ...s, error: e.message };
  }
}
