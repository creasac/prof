"use client";

import { useState, type CSSProperties, type InputHTMLAttributes } from "react";

type PasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  inputStyle?: CSSProperties;
  wrapperStyle?: CSSProperties;
};

function EyeIcon({ isHidden }: { isHidden: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12c1.6-3.8 5.1-6.8 10-6.8S20.4 8.2 22 12c-1.6 3.8-5.1 6.8-10 6.8S3.6 15.8 2 12Z" />
      <circle cx="12" cy="12" r="3.1" />
      {isHidden ? <path d="M3.5 3.5 20.5 20.5" /> : null}
    </svg>
  );
}

export function PasswordField({ inputStyle, wrapperStyle, ...inputProps }: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <span style={{ ...styles.wrapper, ...wrapperStyle }}>
      <input
        {...inputProps}
        type={isVisible ? "text" : "password"}
        style={{
          ...inputStyle,
          paddingRight: "42px",
        }}
      />
      <button
        type="button"
        onClick={() => setIsVisible((current) => !current)}
        style={styles.toggleButton}
        aria-label={isVisible ? "Hide password" : "Show password"}
        aria-pressed={isVisible}
      >
        <EyeIcon isHidden={isVisible} />
      </button>
    </span>
  );
}

const styles: Record<string, CSSProperties> = {
  wrapper: {
    position: "relative",
    display: "block",
    width: "100%",
  },
  toggleButton: {
    position: "absolute",
    top: "50%",
    right: "8px",
    transform: "translateY(-50%)",
    width: "28px",
    height: "28px",
    border: 0,
    borderRadius: "8px",
    background: "transparent",
    color: "var(--warm-muted)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    padding: 0,
  },
};
