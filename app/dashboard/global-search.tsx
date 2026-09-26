"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { SearchHit } from "@/db";
import { search } from "./search-action";

const GROUP: Record<SearchHit["kind"], string> = {
  space: "Spaces",
  page: "Pages",
  component: "Components",
};

/**
 * Settings has no route of its own yet (#24 is sign-in), so the connect page —
 * endpoint, tokens, auth — is what belongs under that heading today.
 */
const SETTINGS = [
  {
    id: "connect",
    title: "Connect agent",
    subtitle: "MCP endpoint, tokens and auth",
    href: "/dashboard/connect",
  },
];

type Row = { key: string; title: string; subtitle: string; href: string };

const Magnifier = () => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden
    className="size-4 shrink-0"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
  >
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </svg>
);

const Hint = ({ children }: { children: string }) => (
  <kbd className="px-1.5 py-0.5 font-sans text-[0.625rem] text-smoke">{children}</kbd>
);

/**
 * The dashboard's search, opened the way Control Center is: a keystroke, not a
 * place. ⌘K (or Ctrl+K) opens the overlay from any dashboard page, and the
 * sidebar row is the same thing for anyone who would rather click.
 */
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [found, setFound] = useState<{ term: string; hits: SearchHit[] }>({
    term: "",
    hits: [],
  });
  const [cursor, setCursor] = useState(0);
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const query = term.trim();
  // Only results for the term on screen, so a slow answer cannot land on a newer one.
  const hits = found.term === query ? found.hits : [];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((was) => !was);
        return;
      }
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A modal behind a keystroke: focus the field, and stop the page scrolling.
  useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    field.current?.focus();

    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (query.length < 2) return;

    const timer = setTimeout(() => {
      search(query).then((next) => setFound({ term: query, hits: next }));
    }, 150);

    return () => clearTimeout(timer);
  }, [query]);

  const groups = [
    ...(["space", "page", "component"] as const).map((kind) => ({
      label: GROUP[kind],
      rows: hits
        .filter((hit) => hit.kind === kind)
        .map((hit): Row => ({
          key: `${hit.kind}-${hit.id}`,
          title: hit.title,
          subtitle: hit.subtitle,
          href: hit.href,
        })),
    })),
    {
      label: "Settings",
      // The same minimum the query uses: without it every string would match on
      // an empty or one-letter term, and the panel would never show its hint.
      rows:
        query.length < 2
          ? []
          : SETTINGS.filter((setting) =>
              setting.title.toLowerCase().includes(query.toLowerCase()),
            ).map((setting): Row => ({
              key: `setting-${setting.id}`,
              title: setting.title,
              subtitle: setting.subtitle,
              href: setting.href,
            })),
    },
  ].filter((group) => group.rows.length > 0);

  const flat = groups.flatMap((group) => group.rows);
  // Clamped rather than reset, so a shrinking result set cannot leave the
  // cursor past the end.
  const active = flat.length === 0 ? -1 : Math.min(cursor, flat.length - 1);

  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const close = () => {
    setOpen(false);
    setTerm("");
    setFound({ term: "", hits: [] });
    setCursor(0);
  };

  const go = (row: Row | undefined) => {
    if (!row) return;
    close();
    router.push(row.href);
  };

  const onFieldKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (flat.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : flat.length - 1;
      setCursor((current) => (current + step) % flat.length);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      go(flat[active]);
      return;
    }

    if (event.key === "Escape") close();
  };

  /** A modal has to hold the keyboard too, not just the scroll. */
  const onDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;

    const focusable = dialog.current?.querySelectorAll<HTMLElement>("input, a[href], button");
    if (!focusable || focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      <div className="min-w-0 flex-1 sm:max-w-sm">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2 rounded-lg border border-line bg-card px-3 py-1.5 text-sm text-smoke transition-colors hover:border-ink/20 hover:text-ink"
        >
          <Magnifier />
          <span className="truncate">Search spaces, pages, components</span>
          <span className="ml-auto shrink-0">
            <Hint>⌘K</Hint>
          </span>
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-ink/25 px-4 pt-[12vh] backdrop-blur-sm"
          onClick={close}
        >
          <div
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={onDialogKeyDown}
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-card shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-line px-4 text-smoke">
              <Magnifier />
              <input
                ref={field}
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                onKeyDown={onFieldKeyDown}
                placeholder="Search spaces, pages, components"
                aria-label="Search spaces, pages and components"
                className="h-14 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-smoke"
              />
              <Hint>esc</Hint>
            </div>

            <div ref={list} className="max-h-[55vh] overflow-y-auto p-2">
              {flat.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-smoke">
                  {query.length < 2 ? "Type at least two characters." : `No matches for “${query}”.`}
                </p>
              ) : (
                groups.map((group) => (
                  <div key={group.label} className="py-1">
                    <p className="label px-3 py-1">{group.label}</p>
                    <ul>
                      {group.rows.map((row) => {
                        const isActive = flat.indexOf(row) === active;
                        return (
                          <li key={row.key}>
                            <Link
                              href={row.href}
                              data-active={isActive}
                              onMouseEnter={() => setCursor(flat.indexOf(row))}
                              onClick={close}
                              className={`flex items-baseline gap-3 rounded-lg px-3 py-2 ${
                                isActive ? "bg-ink/[0.06]" : ""
                              }`}
                            >
                              <span className="min-w-0 flex-1 truncate text-sm text-ink">
                                {row.title}
                              </span>
                              <span className="shrink-0 truncate text-xs text-smoke">
                                {row.subtitle}
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
