"use client";

import { useCallback, useEffect, useRef } from "react";

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
  const lastValue = useRef(value);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  // The field is uncontrolled so typing never fights React, but it still has to
  // follow the value it was given — when the selected post changes, or when a save
  // comes back from the server. Only adopt a value the parent actually changed, so
  // an in-flight edit is never stomped.
  useEffect(() => {
    if (value !== lastValue.current && ref.current) {
      lastValue.current = value;
      ref.current.value = value;
    }
    resize();
  }, [value, resize]);

  // Height is measured from scrollHeight, which is wrong until the real face has
  // loaded and wrong again at a new width. Measuring once on mount clipped captions
  // and transcripts to a single line, because the first measurement happened while
  // the fallback font was still in place.
  useEffect(() => {
    document.fonts?.ready.then(resize).catch(() => {});
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

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
