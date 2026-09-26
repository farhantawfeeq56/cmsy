"use client";

import { useRef, useState } from "react";
import { renameSpace } from "../actions";

/**
 * The space's name, edited where it is shown. The dashboard's New Space button
 * has no field, so every space arrives as "Untitled space" and is named here —
 * which is also why the field takes focus while it still holds that default.
 */
export function SpaceTitle({
  id,
  name,
  className = "text-4xl tracking-[-0.02em]",
}: {
  id: string;
  name: string;
  /** The whole size and tracking set, so a layout can pick its own. */
  className?: string;
}) {
  const [value, setValue] = useState(name);
  const saved = useRef(name);
  const untitled = name === "Untitled space";

  const commit = (next: string) => {
    const trimmed = next.trim();
    if (!trimmed) {
      setValue(saved.current);
      return;
    }
    if (trimmed === saved.current) return;

    saved.current = trimmed;
    const data = new FormData();
    data.set("id", id);
    data.set("name", trimmed);
    void renameSpace(data);
  };

  return (
    <input
      value={value}
      maxLength={80}
      aria-label="Space name"
      autoFocus={untitled}
      onFocus={(event) => {
        if (untitled) event.currentTarget.select();
      }}
      onChange={(event) => setValue(event.target.value)}
      onBlur={(event) => commit(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      className={`font-primary w-full min-w-0 rounded-md border border-transparent bg-transparent px-1 py-0.5 font-normal outline-none hover:border-line focus:border-line focus:bg-card ${className}`}
    />
  );
}
