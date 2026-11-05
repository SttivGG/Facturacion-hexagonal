import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import type { Persona } from "../types";
import { Field } from "./forms";
import { Button, ErrorNotice } from "./ui";
import { PersonEditor } from "./PersonEditor";

export function PersonSelector({ value, onSelect, seller = false, notify }: {
  value?: Persona; onSelect: (person?: Persona) => void; seller?: boolean; notify: (message: string) => void;
}) {
  const [type, setType] = useState("CC");
  const [document, setDocument] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [editor, setEditor] = useState(false);
  const [identity, setIdentity] = useState<{ tipoDocumento: string; numeroDocumento: string }>();
  const abort = useRef<AbortController | null>(null);
  const section = useRef<HTMLElement>(null);
  useEffect(() => () => abort.current?.abort(), []);
  function accept(person: Persona) {
    const allowed = seller ? person.roles.some(r => r === "TRABAJADOR" || r === "ADMINISTRADOR") : person.roles.includes("CLIENTE");
    if (!person.activo || !allowed) {
      onSelect(undefined);
      setError(seller ? "El vendedor debe estar activo y tener rol Trabajador o Administrador." : "La persona debe estar activa y tener rol Cliente. Puedes actualizarla en Personas.");
      return;
    }
    setError(""); onSelect(person);
    if (!editor) requestAnimationFrame(focusSelection);
  }
  function focusSelection() { section.current?.querySelector<HTMLElement>(".selected-person")?.focus({ preventScroll: true }); }
  async function search() {
    if (busy) return;
    setError(""); setMissing(false);
    if (!type.trim() || !document.trim()) { setError("Escribe tipo y número de documento."); return; }
    const controller = new AbortController(); abort.current = controller;
    setBusy(true); onSelect(undefined);
    try { accept(await api.personByDocument(type, document, controller.signal)); }
    catch (reason) {
      if (controller.signal.aborted) return;
      setMissing(reason instanceof ApiError && reason.status === 404);
      setError(reason instanceof Error ? reason.message : "No se pudo consultar la persona.");
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <section ref={section} className="person-selector">
    <h3>{seller ? "Vendedor opcional" : "Cliente de la venta"}</h3>
    {value ? <div className="selected-person" tabIndex={-1}>
      <strong>{value.nombres} {value.apellidos}</strong>
      <span>{value.tipoDocumento} {value.numeroDocumento}</span>
      {value.correo && <span>{value.correo}</span>}
      {value.telefono && <span>{value.telefono}</span>}
      <Button type="button" variant="ghost" onClick={() => onSelect(undefined)}>Cambiar {seller ? "vendedor" : "cliente"}</Button>
    </div> : <>
      <div className="document-search">
        <Field name={seller ? "sellerType" : "customerType"} label={`Tipo de documento${seller ? " del vendedor" : " del cliente"}`}>
          {props => <input {...props} value={type} maxLength={30} disabled={busy} onChange={e => { setType(e.target.value); setMissing(false); }} />}
        </Field>
        <Field name={seller ? "sellerDocument" : "customerDocument"} label={`Número de documento${seller ? " del vendedor" : " del cliente"}`}>
          {props => <input {...props} value={document} maxLength={80} disabled={busy} onChange={e => { setDocument(e.target.value); setMissing(false); }} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void search(); } }} />}
        </Field>
      </div>
      <Button type="button" busy={busy} onClick={search}>Buscar {seller ? "vendedor" : "cliente"}</Button>
      {error && <ErrorNotice message={error} />}
      {!seller && missing && <Button type="button" onClick={() => { setIdentity({ tipoDocumento: type.trim(), numeroDocumento: document.trim() }); setEditor(true); }}>Registrar nuevo cliente</Button>}
    </>}
    {!seller && <PersonEditor open={editor} initialIdentity={identity} onClose={() => setEditor(false)} onClosed={focusSelection} onSaved={notify} onPersisted={() => {}} onCreated={accept} />}
  </section>;
}
