import type { ChatFn } from '@/providers/client';

type Item = string | string[] | Error;

/** Fila roteirizada de respostas; registra as mensagens de cada chamada. */
export function fakeChat(items: Item[]) {
  const calls: { messages: { role: string; content: string }[] }[] = [];
  const chat: ChatFn = async function* (req) {
    calls.push({ messages: req.messages });
    const item = items.shift();
    if (item === undefined) throw new Error('sem roteiro');
    if (item instanceof Error) throw item;
    for (const c of Array.isArray(item) ? item : [item]) yield c;
  };
  return { chat, calls };
}
