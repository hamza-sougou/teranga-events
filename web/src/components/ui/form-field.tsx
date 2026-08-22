interface FormFieldProps {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}

export function FormField({ label, htmlFor, required, hint, error, children }: FormFieldProps) {
  return (
    <div className="mb-4">
      <label htmlFor={htmlFor} className="mb-1.5 block text-[12px] font-bold text-text">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-[11px] font-semibold text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[11px] text-text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
