"use client";

import { useEffect, useRef } from "react";

/**
 * Every captured field is editable in place, because extraction is a first draft
 * and the strategist's judgment is the actual product. It stays looking like text
 * until you put a cursor in it — a page of input boxes would read as data entry
 * rather than as a swipe file.
 */
export default function AutoTextarea({
  id,
  value,
  className,
  placeholder,
  onCommit,
}: {
  id: string;
  value: string;
  className: string;
  placeholder: string;
  onCommit: (next: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(resize, [value]);

  return (
    <textarea
      id={id}
      ref={ref}
      rows={1}
      className={`editable ${className}`}
      defaultValue={value}
      placeholder={placeholder}
      onInput={resize}
      onBlur={(e) => {
        if (e.target.value !== value) onCommit(e.target.value);
      }}
    />
  );
}
