/**
 * Formatting console arguments the way a terminal shows them.
 *
 * This is deliberately not `JSON.stringify`: the original piped a real Node
 * process's stdout to the terminal pane, so users expect `undefined`, `NaN`,
 * functions, `Map`, `Set` and circular references to render as something
 * readable rather than disappearing or throwing.
 */

const MAX_DEPTH = 4;
const MAX_ITEMS = 100;
const MAX_STRING = 10_000;

/** Format one console argument. Never throws. */
export function formatValue(value: unknown): string {
  try {
    return format(value, 0, new WeakSet());
  } catch {
    return "[unserialisable]";
  }
}

/** Format a whole console call, space separated like a real console. */
export function formatArgs(args: readonly unknown[]): string {
  return args.map(formatValue).join(" ");
}

function format(value: unknown, depth: number, seen: WeakSet<object>): string {
  // A top-level string prints bare; nested in a structure it gets quotes, so
  // `console.log("a")` shows `a` but `console.log(["a"])` shows `[ 'a' ]`.
  if (typeof value === "string") {
    return depth === 0 ? truncate(value) : `'${truncate(value)}'`;
  }
  if (value === null) return "null";
  if (value === undefined) return "undefined";

  switch (typeof value) {
    case "number":
      // Distinguish -0 from 0, as a console does.
      return Object.is(value, -0) ? "-0" : String(value);
    case "boolean":
      return String(value);
    case "bigint":
      return `${value}n`;
    case "symbol":
      return value.toString();
    case "function": {
      const named = value.name;
      return named ? `[Function: ${named}]` : "[Function (anonymous)]";
    }
    default:
      break;
  }

  const object = value as object;

  if (seen.has(object)) return "[Circular *1]";
  if (depth > MAX_DEPTH) return "[Object]";

  if (value instanceof Error) {
    return value.stack?.split("\n")[0] ?? `${value.name}: ${value.message}`;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
  }
  if (value instanceof RegExp) return value.toString();

  seen.add(object);
  try {
    if (Array.isArray(value)) {
      const items = value
        .slice(0, MAX_ITEMS)
        .map((item) => format(item, depth + 1, seen));
      if (value.length > MAX_ITEMS) {
        items.push(`... ${value.length - MAX_ITEMS} more items`);
      }
      return items.length === 0 ? "[]" : `[ ${items.join(", ")} ]`;
    }

    if (value instanceof Map) {
      const entries = [...value.entries()]
        .slice(0, MAX_ITEMS)
        .map(
          ([k, v]) =>
            `${format(k, depth + 1, seen)} => ${format(v, depth + 1, seen)}`,
        );
      return `Map(${value.size}) {${entries.length ? ` ${entries.join(", ")} ` : ""}}`;
    }

    if (value instanceof Set) {
      const entries = [...value.values()]
        .slice(0, MAX_ITEMS)
        .map((v) => format(v, depth + 1, seen));
      return `Set(${value.size}) {${entries.length ? ` ${entries.join(", ")} ` : ""}}`;
    }

    const entries = Object.entries(value as Record<string, unknown>)
      .slice(0, MAX_ITEMS)
      .map(([key, v]) => `${formatKey(key)}: ${format(v, depth + 1, seen)}`);

    const prefix = constructorPrefix(object);
    if (entries.length === 0) return `${prefix}{}`;
    return `${prefix}{ ${entries.join(", ")} }`;
  } finally {
    seen.delete(object);
  }
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function formatKey(key: string): string {
  return IDENTIFIER.test(key) ? key : `'${key}'`;
}

function constructorPrefix(value: object): string {
  const name = value.constructor?.name;
  return name === undefined || name === "Object" ? "" : `${name} `;
}

function truncate(value: string): string {
  return value.length > MAX_STRING
    ? `${value.slice(0, MAX_STRING)}… (${value.length - MAX_STRING} more characters)`
    : value;
}

/**
 * Format a thrown value for the terminal.
 *
 * Anything can be thrown in JavaScript, so this accepts `unknown`. The original
 * read `error.response.data.msg` unconditionally, which threw a second error
 * whenever the failure was not an axios response — turning a user's syntax
 * error into a blank screen.
 */
export function formatThrown(thrown: unknown): string {
  if (thrown instanceof Error) {
    const name = thrown.name || "Error";
    const message = thrown.message || "(no message)";
    return `${name}: ${message}`;
  }
  return `Uncaught ${formatValue(thrown)}`;
}
