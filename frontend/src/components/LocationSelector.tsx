import { useEffect, useId, useRef, useState } from 'react';
import { departments, isColombian, municipalities, resolveLocation, searchLocations, type LocationValue } from '../locations';
import { Field } from './forms';
import { Button } from './ui';

type Option = { code: string; name: string };

function SearchSelect({ name, label, options, value, disabled, error, onSelect, onPending }: {
  name: string; label: string; options: Option[]; value: string; disabled?: boolean; error?: string;
  onSelect: (code: string) => void; onPending: (name: string, pending: boolean) => void;
}) {
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const selected = options.find(option => option.code === value)?.name || '';
  const filtered = searchLocations(options, query ?? '');
  const choices = query?.trim() ? filtered : [{ code: '', name: 'Sin especificar' }, ...filtered];
  useEffect(() => { setQuery(null); setOpen(false); setActive(0); }, [value, disabled]);
  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);
  function select(code: string) {
    setQuery(null); setOpen(false); setActive(0); onPending(name, false); onSelect(code);
  }
  return <Field name={name} label={label} error={error}
    hint={disabled ? 'Selecciona primero un departamento.' : 'Escribe para buscar y elige una opción. Campo opcional.'}>
    {props => <div className="location-combobox">
      <input {...props} ref={input} name={name} role="combobox" autoComplete="off"
        aria-autocomplete="list" aria-expanded={open} aria-controls={listId}
        aria-activedescendant={open && choices[active] ? `${listId}-${active}` : undefined}
        disabled={disabled} value={query ?? selected} placeholder="Sin especificar"
        onFocus={() => { setOpen(true); setActive(0); }}
        onBlur={() => setOpen(false)}
        onChange={event => {
          const next = event.target.value;
          setQuery(next); setActive(0); setOpen(true);
          onPending(name, next !== selected);
        }}
        onKeyDown={event => {
          if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true);
            if (!choices.length) return;
            setActive(index => !open ? (event.key === 'ArrowDown' ? 0 : choices.length - 1)
              : (index + (event.key === 'ArrowDown' ? 1 : choices.length - 1)) % choices.length);
          }
          if (open && (event.key === 'Home' || event.key === 'End')) {
            event.preventDefault(); setActive(event.key === 'Home' ? 0 : Math.max(0, choices.length - 1));
          }
          if (event.key === 'Enter' && open) {
            event.preventDefault();
            if (choices[active]) select(choices[active].code);
          }
        }} />
      {open && <ul ref={list} id={listId} role="listbox" aria-label={label} className="location-options">
        {choices.map((option, index) => <li key={option.code} id={`${listId}-${index}`} role="option"
          aria-selected={value === option.code} data-active={active === index}
          onMouseDown={event => event.preventDefault()} onClick={() => { select(option.code); input.current?.focus(); }}>
          {option.name}
        </li>)}
        {!filtered.length && <li role="presentation" className="field-hint">Sin coincidencias. Prueba con otro nombre.</li>}
      </ul>}
    </div>}
  </Field>;
}

export function LocationSelector({ value, original, onChange, errors, onPending }: {
  value: LocationValue; original?: LocationValue; onChange: (next: LocationValue) => void;
  errors: Record<string, string>; onPending: (name: string, pending: boolean) => void;
}) {
  const [editInternational, setEditInternational] = useState(false);
  const resolved = resolveLocation(value);
  const international = !isColombian(value.pais);
  const legacy = international || !resolved.recognized;
  function colombia() {
    onPending('departamento', false); onPending('ciudad', false);
    setEditInternational(false);
    onChange({ ...value, pais: 'Colombia', departamento: '', ciudad: '' });
  }
  const textField = (name: keyof LocationValue, label: string, readOnly = false) => <Field name={name} label={label} error={errors[name]}>
    {props => <input {...props} name={name} value={value[name]} readOnly={readOnly}
      onChange={event => onChange({ ...value, [name]: event.target.value })} />}
  </Field>;
  return <div className="location-selector">
    {legacy ? <>
      <div className="location-review" role="status">
        <p>{international ? 'Ubicación internacional. No corresponde al catálogo DIVIPOLA.'
          : 'Revisa esta ubicación: no encontramos una correspondencia única en el catálogo.'}</p>
        <p>Se conservarán los valores originales mientras no cambies la ubicación.</p>
        {international && <Button type="button" onClick={() => setEditInternational(value => !value)}>
          {editInternational ? 'Terminar revisión internacional' : 'Editar ubicación internacional'}
        </Button>}
        <Button type="button" onClick={colombia}>Seleccionar ubicación de Colombia</Button>
      </div>
      {textField('pais', 'País', true)}
      <div className="form-grid">
        {textField('departamento', 'Departamento / región', !editInternational)}
        {textField('ciudad', 'Municipio / ciudad', !editInternational)}
      </div>
    </> : <>
      <Field name="pais" label="País">{props => <input {...props} readOnly value="Colombia" />}</Field>
      <div className="form-grid">
        <SearchSelect name="departamento" label="Departamento" options={departments} value={resolved.department?.code || ''}
          error={errors.departamento} onPending={onPending} onSelect={code => {
            const department = departments.find(row => row.code === code);
            const changed = code !== (resolved.department?.code || '');
            if (changed) onPending('ciudad', false);
            onChange({ ...value, pais: 'Colombia', departamento: department?.name || '', ciudad: changed ? '' : value.ciudad });
          }} />
        <SearchSelect key={resolved.department?.code || ''} name="ciudad" label="Municipio / ciudad"
          options={municipalities(resolved.department?.code || '')} value={resolved.municipality?.code || ''}
          disabled={!resolved.department} error={errors.ciudad} onPending={onPending} onSelect={code => {
            const city = municipalities(resolved.department?.code || '').find(row => row.code === code);
            onChange({ ...value, pais: 'Colombia', departamento: resolved.department?.name || '', ciudad: city?.name || '' });
          }} />
      </div>
    </>}
    {original && legacy && <small className="field-hint">Ubicación guardada: {[original.pais, original.departamento, original.ciudad].filter(Boolean).join(' · ') || 'Sin especificar'}.</small>}
    {textField('direccion', 'Dirección')}
  </div>;
}
