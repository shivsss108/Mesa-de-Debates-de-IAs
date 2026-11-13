'use client';
import { useId } from 'react';
import { PROVIDERS } from '@/providers/table';
import type { CatalogModel } from '@/providers/catalog';
import { TEMPERAMENTOS } from '@/presets/temperamentos';
import { EXPERTISES } from '@/presets/expertises';
import type { PersonaRef, ProviderId, Seat } from '@/types';
import s from './config.module.css';

const CUSTOM = '__custom';
export const MAX_CUSTOM = 1000;

export function ModelPicker({ label, provider, model, models, onChange }: {
  label: string; provider: ProviderId; model: string; models: CatalogModel[];
  onChange: (p: ProviderId, m: string) => void;
}) {
  const pid = useId();
  const mid = useId();
  const opts = models.filter((m) => m.provider === provider).map((m) => m.id);
  if (model && !opts.includes(model)) opts.unshift(model);
  return (
    <>
      <label className={s.field} htmlFor={pid}>
        {label}: provedor
        <select id={pid} className={s.select} value={provider} onChange={(e) => onChange(e.target.value as ProviderId, '')}>
          {(Object.keys(PROVIDERS) as ProviderId[]).map((p) => <option key={p} value={p}>{PROVIDERS[p].nome}</option>)}
        </select>
      </label>
      <label className={s.field} htmlFor={mid}>
        {label}: modelo
        <select id={mid} className={s.select} value={model} onChange={(e) => onChange(provider, e.target.value)}>
          <option value="">{opts.length ? 'Escolha um modelo…' : 'Carregue os modelos'}</option>
          {opts.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
    </>
  );
}

function PersonaField({ label, value, presets, onChange }: {
  label: string; value: PersonaRef; presets: { id: string; nome: string }[]; onChange: (r: PersonaRef) => void;
}) {
  const id = useId();
  const tid = useId();
  const custom = 'custom' in value;
  return (
    <div className={s.field}>
      <label htmlFor={id}>{label}</label>
      <select id={id} className={s.select} value={custom ? CUSTOM : value.presetId}
        onChange={(e) => onChange(e.target.value === CUSTOM ? { custom: '' } : { presetId: e.target.value })}>
        {presets.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        <option value={CUSTOM}>Personalizado…</option>
      </select>
      {custom && (
        <>
          <textarea id={tid} aria-label={`${label} personalizado`} className={s.textarea} maxLength={MAX_CUSTOM} value={value.custom}
            placeholder="Descreva em uma ou duas frases" onChange={(e) => onChange({ custom: e.target.value })} />
          <span className={s.counter}>{value.custom.length}/{MAX_CUSTOM}</span>
        </>
      )}
    </div>
  );
}

export function SeatCard({ seat, index, models, canRemove, onChange, onRemove }: {
  seat: Seat; index: number; models: CatalogModel[]; canRemove: boolean;
  onChange: (s: Seat) => void; onRemove: () => void;
}) {
  const nameId = useId();
  return (
    <fieldset className={s.card}>
      <legend className={s.sr}>Assento {index + 1}</legend>
      <div className={s.cardHead}>
        <span className={s.badge} aria-hidden="true">{index + 1}</span>
        <label className={s.field} htmlFor={nameId}>
          Nome
          <input id={nameId} className={s.input} value={seat.nome} maxLength={24} onChange={(e) => onChange({ ...seat, nome: e.target.value })} />
        </label>
        {canRemove && (
          <button type="button" className={s.btn} aria-label={`Remover ${seat.nome || `assento ${index + 1}`}`} onClick={onRemove}>✕</button>
        )}
      </div>
      <ModelPicker label="Modelo" provider={seat.provider} model={seat.model} models={models}
        onChange={(provider, model) => onChange({ ...seat, provider, model })} />
      <PersonaField label="Temperamento" value={seat.temperamento} presets={TEMPERAMENTOS} onChange={(temperamento) => onChange({ ...seat, temperamento })} />
      <PersonaField label="Expertise" value={seat.expertise} presets={EXPERTISES} onChange={(expertise) => onChange({ ...seat, expertise })} />
    </fieldset>
  );
}
