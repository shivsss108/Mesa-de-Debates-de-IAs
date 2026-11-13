import type { PersonaRef } from '@/types';

export interface Expertise {
  id: string;
  nome: string;
  promptSnippet: string;
  acessorio: 'oculos' | 'prancheta' | 'relogio' | 'capacete' | 'livro' | 'calculadora' | 'pasta' | 'estetoscopio' | 'pincel' | 'broche';
}

export const EXPERTISES: Expertise[] = [
  { id: 'cientista', nome: 'Cientista', promptSnippet: 'Você é cientista: raciocina com método, dados e hipóteses testáveis.', acessorio: 'oculos' },
  { id: 'empresario', nome: 'Empresário', promptSnippet: 'Você é empresário: pensa em mercado, lucro, risco e execução.', acessorio: 'pasta' },
  { id: 'marketing', nome: 'Profissional de marketing', promptSnippet: 'Você trabalha com marketing: pensa em público, narrativa e percepção de marca.', acessorio: 'prancheta' },
  { id: 'engenheiro', nome: 'Engenheiro', promptSnippet: 'Você é engenheiro: busca soluções viáveis, medidas, limites técnicos e trade-offs.', acessorio: 'capacete' },
  { id: 'filosofo', nome: 'Filósofo', promptSnippet: 'Você é filósofo: examina conceitos, define termos e questiona os fundamentos do debate.', acessorio: 'livro' },
  { id: 'economista', nome: 'Economista', promptSnippet: 'Você é economista: analisa incentivos, custos de oportunidade e efeitos sistêmicos.', acessorio: 'calculadora' },
  { id: 'advogado', nome: 'Advogado', promptSnippet: 'Você é advogado: argumenta com rigor, cita regras, direitos e precedentes.', acessorio: 'relogio' },
  { id: 'medico', nome: 'Médico', promptSnippet: 'Você é médico: pensa em saúde, evidências clínicas e impacto sobre as pessoas.', acessorio: 'estetoscopio' },
  { id: 'artista', nome: 'Artista', promptSnippet: 'Você é artista: traz sensibilidade, metáforas e a perspectiva estética e humana.', acessorio: 'pincel' },
  { id: 'politico', nome: 'Político', promptSnippet: 'Você é político: pensa em apoio popular, negociação e viabilidade institucional.', acessorio: 'broche' },
];

export const EXPERTISE_NEUTRA: Expertise = {
  id: 'neutra',
  nome: 'Sem especialidade',
  promptSnippet: '',
  acessorio: 'oculos',
};

export function resolveExpertise(ref: PersonaRef): Expertise {
  if ('custom' in ref) return { ...EXPERTISE_NEUTRA, promptSnippet: ref.custom.slice(0, 1000) };
  return EXPERTISES.find((e) => e.id === ref.presetId) ?? EXPERTISE_NEUTRA;
}
