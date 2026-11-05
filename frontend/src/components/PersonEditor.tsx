import { Save } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError, request } from "../api";
import { roles, roleNames, type Persona, type Rol } from "../types";
import { Field } from "./forms";
import { Button, Confirm, ErrorNotice, Overlay } from "./ui";

const blank = {
  tipoDocumento: "CC",
  numeroDocumento: "",
  nombres: "",
  apellidos: "",
  correo: "",
  telefono: "",
  telefonoAlternativo: "",
  direccion: "",
  ciudad: "",
  departamento: "",
  pais: "Colombia",
  fechaNacimiento: "",
  observaciones: "",
};
type Values = typeof blank;
function fromPerson(person?: Persona): Values {
  return person
    ? (Object.fromEntries(
        Object.keys(blank).map((k) => [k, person[k as keyof Persona] ?? ""]),
      ) as Values)
    : blank;
}

export function PersonEditor({
  open,
  person,
  onClose,
  onSaved,
  onPersisted,
  onCreated,
  initialIdentity,
  onClosed,
}: {
  open: boolean;
  person?: Persona;
  onClose: () => void;
  onSaved: (message: string) => void;
  onPersisted: () => void;
  onCreated?: (person: Persona) => void;
  initialIdentity?: { tipoDocumento: string; numeroDocumento: string };
  onClosed?: () => void;
}) {
  const [values, setValues] = useState<Values>(blank);
  const [selectedRoles, setSelectedRoles] = useState<Rol[]>(["CLIENTE"]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [discard, setDiscard] = useState(false);
  const [partial, setPartial] = useState(false);
  const initial = useRef("");
  const savedId = useRef<string | undefined>(undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (open) {
      const next = person ? fromPerson(person) : { ...blank, ...initialIdentity };
      const nextRoles = person?.roles || (["CLIENTE"] as Rol[]);
      setValues(next);
      setSelectedRoles(nextRoles);
      initial.current = JSON.stringify([next, [...nextRoles].sort()]);
      savedId.current = person?.id;
      setTouched(new Set());
      setErrors({});
      setError("");
      setDiscard(false);
      setPartial(false);
    }
  }, [open, person, initialIdentity]);
  function validate(next: Values) {
    const result: Record<string, string> = {};
    for (const name of ["tipoDocumento", "numeroDocumento", "nombres"] as const)
      if (!next[name].trim()) result[name] = "Este campo es obligatorio.";
    if (
      next.correo.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.correo.trim())
    )
      result.correo = "Escribe un correo válido, como nombre@correo.com.";
    return result;
  }
  function update(name: keyof Values, value: string) {
    const next = { ...values, [name]: value };
    setValues(next);
    setErrors(validate(next));
  }
  function close() {
    if (busy) return;
    if (JSON.stringify([values, [...selectedRoles].sort()]) !== initial.current)
      setDiscard(true);
    else onClose();
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const invalid = validate(values);
    setErrors(invalid);
    setTouched(new Set(Object.keys(values)));
    if (Object.keys(invalid).length) {
      window.setTimeout(
        () =>
          form.current
            ?.querySelector<HTMLElement>('[aria-invalid="true"]')
            ?.focus(),
        0,
      );
      return;
    }
    setBusy(true);
    setError("");
    let saved = false;
    try {
      const existed = Boolean(savedId.current);
      const result = await api.savePerson(
        {
          ...values,
          nombres: values.nombres.trim(),
          numeroDocumento: values.numeroDocumento.trim(),
          correo: values.correo.trim() || null,
          fechaNacimiento: values.fechaNacimiento || null,
          roles: selectedRoles,
        },
        savedId.current,
      );
      savedId.current = result.id;
      saved = true;
      if (
        existed &&
        JSON.stringify([...result.roles].sort()) !==
          JSON.stringify([...selectedRoles].sort())
      )
        await request(`/personas/${encodeURIComponent(result.id)}/roles`, {
          method: "PUT",
          body: JSON.stringify({ roles: selectedRoles }),
        });
      onSaved(person ? "Persona actualizada." : "Persona creada.");
      if (!existed) onCreated?.(result);
      onClose();
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : "No se pudo guardar la persona.";
      setPartial(saved);
      if (saved) onPersisted();
      setError(
        saved
          ? `La información se guardó, pero los roles no: ${message} Reintenta para completar el cambio.`
          : message,
      );
      if (reason instanceof ApiError)
        setErrors((e) => ({ ...e, ...reason.fields }));
    } finally {
      setBusy(false);
    }
  }
  const input = (
    name: keyof Values,
    label: string,
    options: {
      required?: boolean;
      type?: string;
      hint?: string;
      readOnly?: boolean;
    } = {},
  ) => (
    <Field
      key={name}
      name={name}
      label={label}
      required={options.required}
      hint={options.hint}
      error={touched.has(name) ? errors[name] : ""}
    >
      {(props) => (
        <input
          {...props}
          name={name}
          type={options.type || "text"}
          value={values[name]}
          readOnly={options.readOnly}
          onChange={(e) => update(name, e.target.value)}
          onBlur={() => setTouched((t) => new Set(t).add(name))}
        />
      )}
    </Field>
  );
  return (
    <>
      <Overlay
        open={open}
        title={person ? "Editar persona" : "Nueva persona"}
        onClose={close}
        onClosed={onClosed}
        busy={busy}
        footer={
          <>
            <Button onClick={close} disabled={busy}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="person-form"
              variant="primary"
              busy={busy}
            >
              <Save size={16} />
              {partial ? "Completar guardado" : "Guardar persona"}
            </Button>
          </>
        }
      >
        <form
          ref={form}
          id="person-form"
          onSubmit={submit}
          noValidate
          aria-busy={busy}
        >
          <p className="form-intro">
            Las personas detrás de tu negocio.{" "}
            <span>Los campos con * son obligatorios.</span>
          </p>
          {error && <ErrorNotice message={error} />}
          <fieldset disabled={busy}>
            <legend>Identificación</legend>
            <div className="form-grid">
              {input("tipoDocumento", "Tipo de documento", {
                required: true,
                readOnly: Boolean(person),
                hint: person
                  ? "El documento no se puede modificar."
                  : "Ej. CC, CE, NIT o pasaporte.",
              })}
              {input("numeroDocumento", "Número de documento", {
                required: true,
                readOnly: Boolean(person),
              })}
            </div>
            <div className="form-grid">
              {input("nombres", "Nombres", { required: true })}
              {input("apellidos", "Apellidos")}
            </div>
            {input("fechaNacimiento", "Fecha de nacimiento", { type: "date" })}
          </fieldset>
          <fieldset disabled={busy}>
            <legend>Roles</legend>
            <p className="field-hint mb-3">
              Una persona puede tener varios roles. Sin roles, solo podrás
              encontrarla por su documento.
            </p>
            <div className="role-options">
              {roles.map((role) => (
                <label key={role}>
                  <input
                    type="checkbox"
                    checked={selectedRoles.includes(role)}
                    onChange={(e) =>
                      setSelectedRoles((previous) =>
                        e.target.checked
                          ? [...previous, role]
                          : previous.filter((r) => r !== role),
                      )
                    }
                  />
                  <span>{roleNames[role]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset disabled={busy}>
            <legend>Contacto</legend>
            {input("correo", "Correo electrónico", { type: "email" })}
            <div className="form-grid">
              {input("telefono", "Teléfono", { type: "tel" })}
              {input("telefonoAlternativo", "Teléfono alternativo", {
                type: "tel",
              })}
            </div>
            {input("direccion", "Dirección")}
            <div className="form-grid">
              {input("ciudad", "Ciudad")}
              {input("departamento", "Departamento")}
            </div>
            {input("pais", "País")}
            <Field name="observaciones" label="Observaciones">
              {(props) => (
                <textarea
                  {...props}
                  name="observaciones"
                  value={values.observaciones}
                  rows={3}
                  onChange={(e) => update("observaciones", e.target.value)}
                />
              )}
            </Field>
          </fieldset>
        </form>
      </Overlay>
      <Confirm
        open={discard}
        title="¿Descartar los cambios?"
        description={
          partial
            ? "La información de la persona ya se guardó. Se descartará el cambio de roles pendiente."
            : "Los cambios sin guardar se perderán. El formulario seguirá aquí si decides volver."
        }
        onCancel={() => setDiscard(false)}
        onConfirm={() => {
          setDiscard(false);
          onClose();
        }}
      />
    </>
  );
}
