/**
 * The shape a design system's `tokens` must have to be written. Pure and
 * import-free, like `page-doc`, so the MCP tests judge a write by the same
 * rules the database function applies.
 *
 * Tokens are grouped, the way DESIGN.md's front matter groups them. Colours,
 * radii and spacing map a name to a value; typography and components map a
 * name to a set of properties. A value may refer to another token as
 * `{group.name}`, and a write whose reference points at nothing is refused,
 * because the component that names it would quietly lose that style.
 */

export const TOKEN_GROUPS = {
  colors: "flat",
  typography: "nested",
  rounded: "flat",
  spacing: "flat",
  components: "nested",
} as const;

export type TokenGroup = keyof typeof TOKEN_GROUPS;

export const TOKEN_LIMITS = {
  /** Entries in one group, and properties in one nested entry. */
  entries: 100,
  name: 60,
  value: 200,
  /** Characters of stored JSON. DESIGN.md's own set is under 4,000. */
  json: 50_000,
};

const NAME = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const REFERENCE = /\{([a-zA-Z][a-zA-Z0-9_-]*)\.([a-zA-Z][a-zA-Z0-9_-]*)\}/g;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export type TokenCheck = { tokens: Record<string, unknown>; problems: string[] };

/**
 * Every problem with `value` as a token set, so a caller can fix them all in
 * one retry. `tokens` is only meaningful when `problems` is empty.
 */
export function checkTokens(value: unknown): TokenCheck {
  const problems: string[] = [];
  if (!isObject(value)) {
    return { tokens: {}, problems: ["tokens must be an object of groups"] };
  }

  // Every string a reference could sit in, collected as the structure is
  // checked. Only the shape below is ever visited — group, entry, property — so
  // a deeply nested value is reported as the wrong type rather than walked.
  const values: [path: string, value: string][] = [];

  const checkValue = (path: string, entry: unknown) => {
    if (typeof entry !== "string") problems.push(`${path} must be a string`);
    else if (entry.length > TOKEN_LIMITS.value) {
      problems.push(`${path} is ${entry.length} characters; a value holds ${TOKEN_LIMITS.value}`);
    } else values.push([path, entry]);
  };

  const checkNames = (path: string, entries: Record<string, unknown>) => {
    const names = Object.keys(entries);
    if (names.length > TOKEN_LIMITS.entries) {
      problems.push(`${path} has ${names.length} entries; a group holds ${TOKEN_LIMITS.entries}`);
    }
    for (const name of names) {
      if (!NAME.test(name) || name.length > TOKEN_LIMITS.name) {
        problems.push(`${path}.${name} is not a token name: use [a-zA-Z][a-zA-Z0-9_-]*, up to ${TOKEN_LIMITS.name}`);
      }
    }
    return names;
  };

  for (const [group, entries] of Object.entries(value)) {
    const kind = TOKEN_GROUPS[group as TokenGroup];
    if (!kind) {
      problems.push(`"${group}" is not a token group; use ${Object.keys(TOKEN_GROUPS).join(", ")}`);
      continue;
    }
    if (!isObject(entries)) {
      problems.push(`${group} must be an object`);
      continue;
    }

    for (const name of checkNames(group, entries)) {
      const entry = entries[name];
      if (kind === "flat") {
        checkValue(`${group}.${name}`, entry);
      } else if (!isObject(entry)) {
        problems.push(`${group}.${name} must be an object of properties`);
      } else {
        for (const property of checkNames(`${group}.${name}`, entry)) {
          checkValue(`${group}.${name}.${property}`, entry[property]);
        }
      }
    }
  }

  // Checked against the set being written rather than the stored one, since
  // this write replaces the stored one whole. `hasOwn`, so `{colors.constructor}`
  // is not taken for a token every object has.
  for (const [path, entry] of values) {
    for (const [ref, group, name] of entry.matchAll(REFERENCE)) {
      const target = value[group];
      if (!isObject(target) || !Object.hasOwn(target, name)) {
        problems.push(`${path} refers to ${ref}, which this set does not define`);
      }
    }
  }

  // Only once the shape has passed, which bounds it at three levels deep:
  // stringifying an arbitrarily nested value is what would overflow the stack.
  if (!problems.length) {
    const json = JSON.stringify(value);
    if (json.length > TOKEN_LIMITS.json) {
      problems.push(`those tokens are ${json.length} characters; a design system holds ${TOKEN_LIMITS.json}`);
    }
  }

  return { tokens: value, problems };
}
