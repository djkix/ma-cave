import { useId } from 'react';
import { AppellationField } from './AppellationField';
import { ConfidenceBadge, LOW_CONFIDENCE } from './ConfidenceBadge';

interface Props {
  label: string;
  value: string;
  confidence?: number;
  onChange: (value: string) => void;
  serif?: boolean;
  type?: 'text' | 'number';
  options?: { value: string; label: string }[];
  /** Champ appellation : suggestions du référentiel et message si elle est inconnue. */
  appellation?: boolean;
}

export function EditableField({ label, value, confidence, onChange, serif, type = 'text', options, appellation }: Props) {
  const id = useId();
  const low = confidence !== undefined && confidence < LOW_CONFIDENCE;
  return (
    <div className={`field${low ? ' field--low' : ''}${serif ? ' field--serif' : ''}`}>
      <label htmlFor={id} className="field__label">
        {label}
        {confidence !== undefined && <ConfidenceBadge confidence={confidence} />}
      </label>
      {options ? (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : appellation ? (
        <AppellationField id={id} value={value} onChange={onChange} />
      ) : (
        <input id={id} type={type} inputMode={type === 'number' ? 'numeric' : 'text'} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}
