import { useId, type ReactNode } from "react";

export function Field({
  name,
  label,
  error,
  hint,
  required,
  children,
  className = "",
}: {
  name: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: (props: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby": string | undefined;
  }) => ReactNode;
  className?: string;
}) {
  const unique = useId();
  const id = `${name}-${unique}`;
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id}>
        {label}
        {required && <span className="required"> *</span>}
      </label>
      {children({
        id,
        "aria-invalid": Boolean(error),
        "aria-describedby": error || hint ? `${id}-hint` : undefined,
      })}
      {(error || hint) && (
        <small
          id={`${id}-hint`}
          className={error ? "field-error" : "field-hint"}
        >
          {error || hint}
        </small>
      )}
    </div>
  );
}
export const decimalPattern = /^\d{1,32}(\.\d{1,2})?$/;
