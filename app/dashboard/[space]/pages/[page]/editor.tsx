"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Puck, type Config, type Data } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import Image from "@tiptap/extension-image";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import type { PageDoc } from "@/db/page-doc";
import { renamePage, savePageBlocks } from "../../../actions";
import { fromEditor, toEditor } from "./blocks";
import { MagneticPuck } from "./magnetic-plugin";

type Status = "saved" | "saving" | "dirty" | "refused";

/**
 * What the rich-text editor understands beyond Puck's own set: the page
 * allowlist already kept an image, a colour and sub- and superscript, so text
 * written before loses none of it.
 */
const TEXT_EXTENSIONS = [Image, TextStyle, Color, Subscript, Superscript];

/**
 * One block to start from. Puck needs a component to offer, and text is the one
 * every page needs; the other types come back one at a time. The stored body
 * still round-trips through `toEditor`/`fromEditor`, so a page written with
 * more blocks keeps them and they reappear as their types return.
 */
const CONFIG: Config = {
  components: {
    Text: {
      fields: {
        text: { type: "richtext", contentEditable: true, tiptap: { extensions: TEXT_EXTENSIONS } },
      },
      defaultProps: { text: "" },
      render: ({ text }) => <div className="doc">{text}</div>,
    },
  },
  root: {
    render: ({ children }: { children: ReactNode }) => <div className="doc-page">{children}</div>,
  },
};

export function PageEditor({
  space,
  page,
}: {
  space: { slug: string; name: string };
  page: { id: string; title: string; doc: PageDoc };
}) {
  // Frozen: Puck owns the document once it is mounted, so a refresh of the
  // surrounding server tree must never write over what is being edited.
  const [initial] = useState(() => toEditor(page.doc));

  const [title, setTitle] = useState(page.title);
  const [status, setStatus] = useState<Status>("saved");
  const [refusal, setRefusal] = useState("");

  const latest = useRef<Data | null>(null);
  const lastSaved = useRef(JSON.stringify(fromEditor(initial)));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTitle = useRef(page.title);

  /**
   * Autosave. Next dispatches Server Functions from one client in order, so a
   * later save can never be overtaken by an earlier one still in flight.
   */
  const save = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!latest.current) return;
    const doc = fromEditor(latest.current);
    const json = JSON.stringify(doc);
    // Opening a page is not an edit: Puck reports its first render too, and a
    // page still in the old format moves forward on its first real change.
    if (json === lastSaved.current) {
      setStatus("saved");
      return;
    }
    setStatus("saving");
    const result = await savePageBlocks(page.id, doc);
    if (result.saved) {
      lastSaved.current = json;
      setRefusal("");
    } else {
      setRefusal(result.problems[0] ?? "the body was refused");
    }
    // Anything typed while the save was in flight is still waiting on the timer.
    setStatus(!result.saved ? "refused" : timer.current ? "dirty" : "saved");
  }, [page.id]);

  const onChange = useCallback(
    (data: Data) => {
      latest.current = data;
      if (timer.current) clearTimeout(timer.current);
      setStatus("dirty");
      timer.current = setTimeout(() => void save(), 700);
    },
    [save],
  );

  // A tab closed inside the debounce window still gets its last change out.
  useEffect(() => {
    const flush = () => {
      if (timer.current) void save();
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [save]);

  /** Renaming is its own save: it is rare, and it shows up on the space page. */
  const commitTitle = (value: string) => {
    const next = value.trim();
    if (!next) {
      setTitle(savedTitle.current);
      return;
    }
    if (next === savedTitle.current) return;
    savedTitle.current = next;
    const data = new FormData();
    data.set("id", page.id);
    data.set("title", next);
    void renamePage(data);
  };

  const statusLabel =
    status === "saving"
      ? "Saving…"
      : status === "dirty"
        ? "Unsaved changes"
        : status === "refused"
          ? `Not saved: ${refusal}`
          : "Saved";

  return (
    <div className="page-shell">
      <Puck
        config={CONFIG}
        data={initial as Data}
        onChange={onChange}
        // Rendered in the page itself rather than an iframe, so the canvas reads
        // the app's own stylesheet and fonts without copying them across.
        iframe={{ enabled: false }}
        overrides={{
          // The one override Puck renders inside the drag provider, and so
          // the one place the magnetic snapping can reach the drag (#98).
          puck: MagneticPuck,
          header: () => (
            <header className="border-b border-line bg-paper">
              <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
                <Link
                  href={`/dashboard/${space.slug}`}
                  className="btn-quiet -ml-2 shrink-0 rounded-md"
                >
                  ← {space.name}
                </Link>
                <input
                  className="min-w-0 flex-1 bg-transparent text-lg outline-none"
                  value={title}
                  maxLength={120}
                  aria-label="Page title"
                  onChange={(event) => setTitle(event.target.value)}
                  onBlur={(event) => commitTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                  }}
                />
                <span
                  className={`text-xs ${status === "refused" ? "text-ink" : "text-smoke"}`}
                  aria-live="polite"
                >
                  {statusLabel}
                </span>
                <Link
                  href={`/dashboard/${space.slug}?view=design#components`}
                  className="text-xs text-smoke hover:text-ink"
                >
                  Edit components in Design →
                </Link>
              </div>
            </header>
          ),
        }}
      />
    </div>
  );
}
