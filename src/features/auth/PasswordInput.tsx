import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  id: string;
};

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ id, className, disabled, ...props }, ref) {
    const [visible, setVisible] = useState(false);
    const Icon = visible ? EyeOff : Eye;

    return (
      <div className="relative">
        <input
          {...props}
          ref={ref}
          id={id}
          type={visible ? "text" : "password"}
          disabled={disabled}
          className={`input pr-11 ${className ?? ""}`}
        />
        <button
          type="button"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          aria-controls={id}
          disabled={disabled}
          onClick={() => setVisible((current) => !current)}
          className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-xl text-muted transition hover:bg-primary-soft hover:text-primary focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed"
        >
          <Icon size={18} aria-hidden="true" />
        </button>
      </div>
    );
  },
);
