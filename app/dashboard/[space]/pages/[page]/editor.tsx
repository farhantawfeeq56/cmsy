"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Puck, type ComponentConfig, type Config, type Data } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import Image from "@tiptap/extension-image";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { propValues, renderComponent, type Prop } from "@/db/component-template";
import type { PageDoc } from "@/db/page-doc";
import { unsafeUrl } from "@/db/page-html";
import { renamePage, savePageBlocks } from "../../../actions";
import { COMPONENT_PREFIX, componentIds, fromEditor, toEditor } from "./blocks";

type ComponentOption = { id: string; name: string; props: Prop[]; template: string };
type Status = "saved" | "saving" | "dirty" | "refused";

/**
 * What the rich-text editor understands beyond Puck's own set. Each one is
 * something the page allowlist already kept — an image, a colour, sub- and
 * superscript — so a page written before blocks loses none of it on its first
 * edit. Module-level, because Puck rebuilds its editor when this array changes.
 */
const TEXT_EXTENSIONS = [Image, TextStyle, Color, Subscript, Superscript];

/** The built-in blocks. Components are added per space in `buildConfig`. */
const BLOCKS: Record<string, ComponentConfig> = {
  Text: {
    fields: {
      text: { type: "richtext", contentEditable: true, tiptap: { extensions: TEXT_EXTENSIONS } },
    },
    defaultProps: { text: "" },
    render: ({ text }) => <div className="doc">{text}</div>,
  },
  Image: {
    fields: {
      src: { type: "text", label: "Image URL" },
      alt: { type: "text", label: "Description" },
    },
    defaultProps: { src: "", alt: "" },
    render: ({ src, alt }) =>
      src && !unsafeUrl(src) ? (
        <div className="doc">
          {/* eslint-disable-next-line @next/next/no-img-element -- any URL a writer pastes, not a local asset */}
          <img src={src} alt={alt} />
        </div>
      ) : (
        <p className="text-sm text-smoke">Add an image URL in the block&apos;s fields.</p>
      ),
  },
  Section: {
    fields: { content: { type: "slot" } },
    defaultProps: { content: [] },
    render: ({ content: Content }) => <Content as="section" />,
  },
  Columns: {
    fields: { left: { type: "slot" }, right: { type: "slot" } },
    defaultProps: { left: [], right: [] },
    render: ({ left: Left, right: Right }) => (
      <div className="grid gap-6 sm:grid-cols-2">
        <Left />
        <Right />
      </div>
    ),
  },
};

/**
 * One block type per component in the space, plus one for any component the
 * page still holds but the space no longer has, so that block can be seen and
 * removed rather than breaking the whole editor.
 */
function buildConfig(components: ComponentOption[], held: string[]): Config {
  const entries: Record<string, ComponentConfig> = { ...BLOCKS };

  for (const component of components) {
    entries[`${COMPONENT_PREFIX}${component.id}`] = {
      label: component.name,
      fields: {
        values: {
          type: "object",
          label: "Content",
          objectFields: Object.fromEntries(
            component.props.map((prop) => [prop.key, { type: "text", label: prop.label }]),
          ),
        },
      },
      defaultProps: { values: propValues(component.props) },
      render: ({ values }) => {
        const html = renderComponent(component.props, component.template, values);
        return html ? (
          // Rendered from a template `componentProblems` has passed, with every
          // value escaped into place — the same markup the old canvas inserted.
          <div className="doc">
            <div className="comp-block" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        ) : (
          <p className="text-sm text-smoke">{component.name} has no template yet. Build it in Design.</p>
        );
      },
    };
  }

  for (const id of held) {
    entries[`${COMPONENT_PREFIX}${id}`] ??= {
      label: "Missing component",
      render: () => (
        <p className="text-sm text-smoke">
          This component is no longer in the space, so it can only be removed.
        </p>
      ),
    };
  }

  return {
    categories: {
      blocks: { title: "Blocks", components: Object.keys(BLOCKS) },
      components: {
        title: "Components",
        components: components.map((component) => `${COMPONENT_PREFIX}${component.id}`),
      },
    },
    components: entries,
    root: {
      render: ({ children }: { children: ReactNode }) => <div className="doc-page">{children}</div>,
    },
  };
}

export function PageEditor({
  space,
  page,
  components,
}: {
  space: { slug: string; name: string };
  page: { id: string; title: string; doc: PageDoc };
  components: ComponentOption[];
}) {
  // Frozen: Puck owns the document once it is mounted, so a refresh of the
  // surrounding server tree must never write over what is being edited.
  const [initial] = useState(() => toEditor(page.doc));
  const [held] = useState(() => componentIds(page.doc));
  const config = useMemo(() => buildConfig(components, held), [components, held]);

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
        config={config}
        data={initial as Data}
        onChange={onChange}
        // Rendered in the page itself rather than an iframe, so the canvas reads
        // the app's own stylesheet and fonts without copying them across.
        iframe={{ enabled: false }}
        overrides={{
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
