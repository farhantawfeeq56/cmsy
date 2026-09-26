"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";

/** What the shell knows about the agent. `null` means nothing is connected. */
export type Agent = { name: string; lastUsed: string } | null;

/** Every place the status could live. All are in the shell, so all persist. */
const PLACES = [
  { id: "sidebar-top", name: "Sidebar top" },
  { id: "nav-end", name: "Nav end" },
  { id: "sidebar-foot", name: "Sidebar foot" },
  { id: "content-top", name: "Content top" },
  { id: "floating", name: "Floating" },
] as const;

type Place = (typeof PLACES)[number]["id"];

/**
 * A module store, because one picker has to move a status that is rendered in
 * five different spots of the shell. A vartest scaffold: once a place wins,
 * delete everything but the winner and pass `agent` straight to it.
 */
let current: Place = "sidebar-top";
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const select = (place: Place) => {
  current = place;
  listeners.forEach((listener) => listener());
};

const usePlace = () =>
  useSyncExternalStore(
    subscribe,
    () => current,
    () => "sidebar-top" as Place,
  );

/** How the status is dressed, which is the same wherever it lands. */
const Status = ({ agent }: { agent: Agent }) =>
  agent ? (
    <Link
      href="/dashboard/connect"
      title={`${agent.name} · last used ${agent.lastUsed}`}
      className="badge"
    >
      <span aria-hidden className="size-1.5 rounded-full bg-ink" />
      Agent connected
    </Link>
  ) : (
    <Link href="/dashboard/connect" className="btn btn-quiet border border-line">
      Connect agent
    </Link>
  );

/** Each place needs its own wrapper: margin in the sidebar, a bar in the content. */
const SHELL: Record<Place, string> = {
  "sidebar-top": "mt-4 px-2",
  "nav-end": "mt-2 px-2",
  "sidebar-foot": "mt-auto pt-4 px-2",
  "content-top": "flex justify-end border-b border-line px-6 py-2.5",
  floating: "fixed top-6 right-6 z-40",
};

/** A mount point. Only the selected one renders anything. */
export function AgentSlot({ place, agent }: { place: Place; agent: Agent }) {
  const active = usePlace();
  if (active !== place) return null;

  return (
    <div className={SHELL[place]}>
      <Status agent={agent} />
    </div>
  );
}

/** The vartest picker: keys 1-5. */
export function AgentPlacePicker() {
  const active = usePlace();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const index = Number(event.key) - 1;
      if (index >= 0 && index < PLACES.length) select(PLACES[index].id);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const activePlace = PLACES.find((place) => place.id === active) ?? PLACES[0];

  return (
    <div className="fixed right-6 bottom-6 z-50 flex items-center gap-2 rounded-full border border-line bg-card/90 p-1.5 pl-3 shadow-lg backdrop-blur">
      <span className="font-primary text-xs text-smoke">
        {PLACES.indexOf(activePlace) + 1}. {activePlace.name}
      </span>
      <div className="flex gap-0.5">
        {PLACES.map((place, i) => (
          <button
            key={place.id}
            type="button"
            title={`${i + 1}. ${place.name}`}
            aria-pressed={place.id === active}
            onClick={() => select(place.id)}
            className={`flex size-7 items-center justify-center rounded-full text-xs tabular-nums transition-colors ${
              place.id === active ? "bg-ink text-white" : "text-smoke hover:bg-ink/[0.06]"
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}
