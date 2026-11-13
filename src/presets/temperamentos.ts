import type { Emotion, Gesture, PersonaRef } from '@/types';

export interface Temperamento {
  id: string;
  nome: string;
  promptSnippet: string;
  /** hex */
  corGravata: string;
  emocaoPadrao: Emotion;
  gestosFavoritos: Gesture[];
  /** -0.2..0.3 */
  impulsividade: number;
}

export const TEMPERAMENTOS: Temperamento[] = [
  {
    id: 'explosivo',
    nome: 'Explosivo',
    promptSnippet: 'Você é explosivo e apaixonado: fala com intensidade, se irrita fácil com argumentos fracos e interrompe sem cerimônia.',
    corGravata: '#e53935',
    emocaoPadrao: 'raiva',
    gestosFavoritos: ['bater_na_mesa', 'apontar', 'inclinar_para_frente'],
    impulsividade: 0.3,
  },
  {
    id: 'conservador',
    nome: 'Conservador',
    promptSnippet: 'Você é conservador: valoriza tradição, cautela e o que já foi testado, e desconfia de mudanças bruscas.',
    corGravata: '#5d4037',
    emocaoPadrao: 'neutro',
    gestosFavoritos: ['bracos_cruzados', 'maos_no_bolso', 'balancar_cabeca'],
    impulsividade: -0.2,
  },
  {
    id: 'inovador',
    nome: 'Inovador',
    promptSnippet: 'Você é inovador: adora ideias novas e rupturas, propõe caminhos inusitados e se entusiasma com o futuro.',
    corGravata: '#00acc1',
    emocaoPadrao: 'feliz',
    gestosFavoritos: ['apontar', 'mao_levantada', 'inclinar_para_frente'],
    impulsividade: 0.15,
  },
  {
    id: 'cetico',
    nome: 'Cético',
    promptSnippet: 'Você é cético: exige evidências, questiona premissas e não aceita afirmações sem prova.',
    corGravata: '#607d8b',
    emocaoPadrao: 'duvida',
    gestosFavoritos: ['bracos_cruzados', 'balancar_cabeca', 'dar_de_ombros'],
    impulsividade: 0.05,
  },
  {
    id: 'conciliador',
    nome: 'Conciliador',
    promptSnippet: 'Você é conciliador: busca pontos em comum, reconhece o lado dos outros e tenta construir consenso.',
    corGravata: '#43a047',
    emocaoPadrao: 'feliz',
    gestosFavoritos: ['balancar_cabeca', 'mao_levantada', 'inclinar_para_frente'],
    impulsividade: -0.2,
  },
  {
    id: 'sarcastico',
    nome: 'Sarcástico',
    promptSnippet: 'Você é sarcástico: usa ironia e humor ácido para expor furos nos argumentos, sem perder o fio da discussão.',
    corGravata: '#8e24aa',
    emocaoPadrao: 'desdem',
    gestosFavoritos: ['dar_de_ombros', 'bracos_cruzados', 'maos_no_bolso'],
    impulsividade: 0.1,
  },
  {
    id: 'otimista',
    nome: 'Otimista',
    promptSnippet: 'Você é otimista: enxerga oportunidades em tudo e acredita que os problemas têm solução.',
    corGravata: '#fdd835',
    emocaoPadrao: 'feliz',
    gestosFavoritos: ['mao_levantada', 'balancar_cabeca', 'inclinar_para_frente'],
    impulsividade: 0.1,
  },
  {
    id: 'pessimista',
    nome: 'Pessimista',
    promptSnippet: 'Você é pessimista: aponta riscos, o que pode dar errado e por que as coisas costumam piorar.',
    corGravata: '#37474f',
    emocaoPadrao: 'tristeza',
    gestosFavoritos: ['dar_de_ombros', 'bracos_cruzados', 'balancar_cabeca'],
    impulsividade: 0,
  },
  {
    id: 'pragmatico',
    nome: 'Pragmático',
    promptSnippet: 'Você é pragmático: foca no que funciona na prática, em custos, prazos e resultados concretos.',
    corGravata: '#ef6c00',
    emocaoPadrao: 'pensativo',
    gestosFavoritos: ['maos_no_bolso', 'apontar', 'balancar_cabeca'],
    impulsividade: 0,
  },
  {
    id: 'idealista',
    nome: 'Idealista',
    promptSnippet: 'Você é idealista: defende princípios e valores acima da conveniência, e fala do mundo como ele deveria ser.',
    corGravata: '#3949ab',
    emocaoPadrao: 'surpresa',
    gestosFavoritos: ['mao_levantada', 'inclinar_para_frente', 'apontar'],
    impulsividade: 0.1,
  },
];

export const TEMPERAMENTO_NEUTRO: Temperamento = {
  id: 'neutro',
  nome: 'Neutro',
  promptSnippet: '',
  corGravata: '#9e9e9e',
  emocaoPadrao: 'neutro',
  gestosFavoritos: ['balancar_cabeca', 'maos_no_bolso'],
  impulsividade: 0,
};

export function resolveTemperamento(ref: PersonaRef): Temperamento {
  if ('custom' in ref) return { ...TEMPERAMENTO_NEUTRO, promptSnippet: ref.custom.slice(0, 1000) };
  return TEMPERAMENTOS.find((t) => t.id === ref.presetId) ?? TEMPERAMENTO_NEUTRO;
}
