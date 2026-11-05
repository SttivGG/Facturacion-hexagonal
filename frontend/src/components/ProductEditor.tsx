import { ImagePlus, Save, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError, request } from "../api";
import type { Persona, Producto } from "../types";
import { Field, decimalPattern } from "./forms";
import { Button, Confirm, ErrorNotice, Overlay } from "./ui";
import { ProviderSelector } from "./ProviderSelector";
import { PersonEditor } from "./PersonEditor";

interface Values {
  sku: string;
  nombre: string;
  descripcion: string;
  categoria: string;
  costo: string;
  precioVenta: string;
  proveedorId: string;
}
const empty: Values = {
  sku: "",
  nombre: "",
  descripcion: "",
  categoria: "",
  costo: "",
  precioVenta: "",
  proveedorId: "",
};
const valuesFrom = (product?: Producto): Values =>
  product
    ? {
        sku: product.sku,
        nombre: product.nombre,
        descripcion: product.descripcion || "",
        categoria: product.categoria || "",
        costo: String(product.costo),
        precioVenta: String(product.precioVenta),
        proveedorId: product.proveedorId || "",
      }
    : empty;

export function ProductEditor({
  open,
  product,
  onClose,
  onSaved,
  onPersisted,
}: {
  open: boolean;
  product?: Producto;
  onClose: () => void;
  onSaved: (message: string) => void;
  onPersisted: () => void;
}) {
  const [values, setValues] = useState<Values>(empty);
  const initial = useRef(empty);
  const savedId = useRef<string | undefined>(undefined);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [image, setImage] = useState<File>();
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [discard, setDiscard] = useState(false);
  const [partial, setPartial] = useState(false);
  const [providerEditor, setProviderEditor] = useState(false);
  const [createdProvider, setCreatedProvider] = useState<Persona>();
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (open) {
      const next = valuesFrom(product);
      setValues(next);
      initial.current = next;
      savedId.current = product?.id;
      setImage(undefined);
      setErrors({});
      setTouched(new Set());
      setError("");
      setDiscard(false);
      setPartial(false);
      setProviderEditor(false);
      setCreatedProvider(undefined);
    }
  }, [open, product]);
  useEffect(() => {
    if (!image) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);
  function validate(next: Values) {
    const result: Record<string, string> = {};
    if (!next.sku.trim()) result.sku = "Escribe el SKU del producto.";
    if (!next.nombre.trim()) result.nombre = "Escribe el nombre del producto.";
    if (!decimalPattern.test(next.costo))
      result.costo = "Usa un importe positivo o cero, con hasta 2 decimales.";
    if (!decimalPattern.test(next.precioVenta))
      result.precioVenta =
        "Usa un importe positivo o cero, con hasta 2 decimales.";
    return result;
  }
  function update(name: keyof Values, value: string) {
    const next = { ...values, [name]: value };
    setValues(next);
    setErrors(validate(next));
  }
  function close() {
    if (busy) return;
    if (image || JSON.stringify(values) !== JSON.stringify(initial.current))
      setDiscard(true);
    else onClose();
  }
  function chooseImage(file?: File) {
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 3 * 1024 * 1024 ||
      file.size === 0
    ) {
      setError("Selecciona una imagen JPG, PNG o WebP de hasta 3 MB.");
      return;
    }
    setImage(file);
    setError("");
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
      const result = await api.saveProduct(
        {
          ...values,
          sku: values.sku.trim(),
          nombre: values.nombre.trim(),
          proveedorId: values.proveedorId || null,
        },
        savedId.current,
      );
      savedId.current = result.id;
      saved = true;
      if (image) {
        const body = new FormData();
        body.append("imagen", image);
        await request(`/productos/${encodeURIComponent(result.id)}/imagen`, {
          method: "POST",
          body,
        });
      }
      onSaved(product ? "Producto actualizado." : "Producto creado.");
      onClose();
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : "No se pudo guardar el producto.";
      setPartial(saved);
      if (saved) onPersisted();
      setError(
        saved
          ? `El producto se guardó, pero la imagen no: ${message} Puedes reintentar; no se creará otro producto.`
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
      hint?: string;
      decimal?: boolean;
      placeholder?: string;
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
          value={values[name]}
          placeholder={options.placeholder}
          inputMode={options.decimal ? "decimal" : undefined}
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
        title={product ? "Editar producto" : "Nuevo producto"}
        onClose={close}
        busy={busy}
        footer={
          <>
            <Button onClick={close} disabled={busy}>
              Cancelar
            </Button>
            <Button
              form="product-form"
              type="submit"
              variant="primary"
              busy={busy}
            >
              <Save size={16} />
              {partial ? "Reintentar guardado" : "Guardar producto"}
            </Button>
          </>
        }
      >
        <form
          ref={form}
          id="product-form"
          onSubmit={submit}
          noValidate
          aria-busy={busy}
        >
          <p className="form-intro">
            Los detalles que hacen único a tu producto.{" "}
            <span>Los campos con * son obligatorios.</span>
          </p>
          {error && <ErrorNotice message={error} />}
          <fieldset disabled={busy}>
            <legend>Información del producto</legend>
            {input("nombre", "Nombre", {
              required: true,
              placeholder: "¿Cómo se llama el producto?",
            })}
            <div className="form-grid">
              {input("sku", "SKU", {
                required: true,
                placeholder: "Código único",
              })}
              {input("categoria", "Categoría", {
                placeholder: "Ej. Tecnología",
              })}
            </div>
            <Field name="descripcion" label="Descripción">
              {(props) => (
                <textarea
                  {...props}
                  name="descripcion"
                  value={values.descripcion}
                  rows={3}
                  onChange={(e) => update("descripcion", e.target.value)}
                  placeholder="Características y detalles del producto"
                />
              )}
            </Field>
          </fieldset>
          <fieldset disabled={busy}>
            <legend>Precios y proveedor</legend>
            <div className="form-grid">
              {input("costo", "Costo · COP", {
                required: true,
                decimal: true,
                placeholder: "0.00",
              })}
              {input("precioVenta", "Precio de venta · COP", {
                required: true,
                decimal: true,
                placeholder: "0.00",
              })}
            </div>
            <ProviderSelector value={values.proveedorId} onChange={id => update("proveedorId", id)}
              active={open} disabled={busy} knownProvider={createdProvider} onCreate={() => setProviderEditor(true)} />
          </fieldset>
          <fieldset disabled={busy}>
            <legend>Imagen del producto</legend>
            <label className={`image-upload ${preview ? "with-preview" : ""}`}>
              {preview ? (
                <img
                  src={preview}
                  alt="Vista previa de la imagen seleccionada"
                />
              ) : product?.imagenId ? (
                <img src={api.image(product)} alt={product.nombre} />
              ) : (
                <ImagePlus size={28} aria-hidden="true" />
              )}
              <span>
                {image ? image.name : "Seleccionar una imagen"}
                <small>JPG, PNG o WebP · Máximo 3 MB</small>
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Imagen del producto"
                onChange={(e) => {
                  chooseImage(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {image && (
              <Button variant="ghost" onClick={() => setImage(undefined)}>
                <X size={14} />
                Quitar selección
              </Button>
            )}
          </fieldset>
        </form>
      </Overlay>
      <PersonEditor open={providerEditor} initialRole="PROVEEDOR"
        onClose={() => setProviderEditor(false)} onSaved={onSaved} onPersisted={() => {}}
        onClosed={() => form.current?.querySelector<HTMLInputElement>("[data-provider-current]")?.focus()}
        onCreated={person => {
          if (person.activo && person.roles.includes("PROVEEDOR")) {
            setCreatedProvider(person);
            update("proveedorId", person.id);
          } else setError("La persona se creó sin rol Proveedor. Puedes asignarle ese rol desde Personas.");
        }} />
      <Confirm
        open={discard}
        title="¿Descartar los cambios?"
        description={
          partial
            ? "El producto ya se guardó. Se descartarán los cambios pendientes de la imagen."
            : "Los cambios sin guardar se perderán. Puedes volver al formulario para continuar."
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
