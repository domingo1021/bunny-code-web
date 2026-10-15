/**
 * Source for the seeded workspace projects.
 *
 * Each entry becomes a project whose version is a *real recording*: the session
 * generator types `source` keystroke by keystroke, so the demo has something
 * worth replaying rather than a file that simply appears.
 */

export interface SeedProjectSource {
  readonly projectName: string;
  readonly projectDescription: string;
  readonly ownerEmail: string;
  readonly isPublic: boolean;
  readonly starCount: number;
  readonly watchCount: number;
  readonly versions: readonly {
    readonly versionName: string;
    readonly fileName: string;
    /** Final content of the file after the recorded session. */
    readonly source: string;
  }[];
}

export const PROJECT_SOURCES: readonly SeedProjectSource[] = [
  {
    projectName: "debounce-from-scratch",
    projectDescription: "Writing debounce without reaching for lodash",
    ownerEmail: "domingoos@gmail.com",
    isPublic: true,
    starCount: 48,
    watchCount: 612,
    versions: [
      {
        versionName: "first pass",
        fileName: "debounce.js",
        source: `function debounce(fn, wait) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

const log = debounce((value) => console.log("saved", value), 300);
log("draft");
`,
      },
      {
        versionName: "add leading edge",
        fileName: "debounce.js",
        source: `function debounce(fn, wait, leading) {
  let timer = null;
  return function (...args) {
    const callNow = leading && timer === null;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (!leading) fn.apply(this, args);
    }, wait);
    if (callNow) fn.apply(this, args);
  };
}
`,
      },
    ],
  },

  {
    projectName: "promise-pool",
    projectDescription: "Run N promises at a time without a library",
    ownerEmail: "domingoos@gmail.com",
    isPublic: true,
    starCount: 31,
    watchCount: 388,
    versions: [
      {
        versionName: "working version",
        fileName: "pool.js",
        source: `async function pool(tasks, limit) {
  const results = [];
  let next = 0;

  async function worker() {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await tasks[index]();
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(limit, tasks.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}
`,
      },
    ],
  },

  {
    projectName: "lru-cache",
    projectDescription: "A tiny LRU cache on top of Map ordering",
    ownerEmail: "guest@gmail.com",
    isPublic: true,
    starCount: 57,
    watchCount: 741,
    versions: [
      {
        versionName: "initial",
        fileName: "lru.js",
        source: `class LRU {
  constructor(capacity) {
    this.capacity = capacity;
    this.items = new Map();
  }

  get(key) {
    if (!this.items.has(key)) return undefined;
    const value = this.items.get(key);
    this.items.delete(key);
    this.items.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.items.has(key)) this.items.delete(key);
    this.items.set(key, value);
    if (this.items.size > this.capacity) {
      this.items.delete(this.items.keys().next().value);
    }
  }
}
`,
      },
    ],
  },

  {
    projectName: "event-emitter",
    projectDescription: "on, off, once — and why off is the hard one",
    ownerEmail: "guest@gmail.com",
    isPublic: true,
    starCount: 22,
    watchCount: 204,
    versions: [
      {
        versionName: "initial",
        fileName: "emitter.js",
        source: `class Emitter {
  constructor() {
    this.handlers = new Map();
  }

  on(event, handler) {
    const set = this.handlers.get(event) ?? new Set();
    set.add(handler);
    this.handlers.set(event, set);
    return () => set.delete(handler);
  }

  emit(event, ...args) {
    for (const handler of [...(this.handlers.get(event) ?? [])]) {
      handler(...args);
    }
  }
}
`,
      },
    ],
  },

  {
    projectName: "flatten-deep",
    projectDescription: "Recursive vs iterative flatten, side by side",
    ownerEmail: "mei@example.com",
    isPublic: true,
    starCount: 15,
    watchCount: 173,
    versions: [
      {
        versionName: "initial",
        fileName: "flatten.js",
        source: `function flatten(input) {
  const out = [];
  const stack = [...input];
  while (stack.length > 0) {
    const item = stack.pop();
    if (Array.isArray(item)) {
      stack.push(...item);
    } else {
      out.push(item);
    }
  }
  return out.reverse();
}

console.log(flatten([1, [2, [3, [4]]]]));
`,
      },
    ],
  },

  {
    projectName: "retry-with-backoff",
    projectDescription: "Exponential backoff with jitter, explained",
    ownerEmail: "mei@example.com",
    isPublic: true,
    starCount: 40,
    watchCount: 522,
    versions: [
      {
        versionName: "initial",
        fileName: "retry.js",
        source: `async function retry(fn, attempts, baseMs) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const wait = baseMs * 2 ** i * (0.5 + Math.random());
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  throw lastError;
}
`,
      },
    ],
  },

  {
    projectName: "deep-equal",
    projectDescription: "Structural equality, including the awkward cases",
    ownerEmail: "arjun@example.com",
    isPublic: true,
    starCount: 19,
    watchCount: 241,
    versions: [
      {
        versionName: "initial",
        fileName: "equal.js",
        source: `function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (a === null || b === null) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => deepEqual(a[key], b[key]));
}
`,
      },
    ],
  },

  {
    projectName: "private-scratchpad",
    projectDescription: "Not ready to show anyone yet",
    ownerEmail: "domingoos@gmail.com",
    isPublic: false,
    starCount: 0,
    watchCount: 3,
    versions: [
      {
        versionName: "wip",
        fileName: "scratch.js",
        source: `const ideas = ["worker pool", "virtual list", "undo stack"];
console.log(ideas.length);
`,
      },
    ],
  },
];
