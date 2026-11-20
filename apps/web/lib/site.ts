function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export const site = {
  name: "Theseus",
  url: siteUrl(),
  line: "Delete the code. Keep the ship.",
  description:
    "Theseus captures an app's behavior as plain-English Kane CLI tests, deletes the code, has AI agents regrow it in other stacks, and proves the regrowth matches the original.",
  hackathon: "KaneCLI Online Hackathon by TestMu AI",
} as const;

export interface Footnote {
  n: number;
  id: string;
  text: string;
  href?: string;
  hrefLabel?: string;
}

/** Numbered like museum labels; every page links to the same numbers. */
export const footnotes: Footnote[] = [
  {
    n: 1,
    id: "kane",
    text: "Kane CLI by TestMu AI runs each plain-English objective in a real browser, an Android emulator or an iOS simulator, and reports a verdict, the steps it took and the values it stored.",
  },
  {
    n: 2,
    id: "todomvc",
    text: "TodoMVC, jQuery edition, from tastejs/todomvc (MIT licence), vendored at commit ff43b02. Written in 2012 with jQuery, Handlebars and Director.",
    href: "https://github.com/tastejs/todomvc",
    hrefLabel: "github.com/tastejs/todomvc",
  },
  {
    n: 3,
    id: "vase",
    text: "The Siren Painter, Odysseus and the Sirens. Attic red-figure stamnos, about 480 to 470 BC. British Museum, E440. Photograph by Jastrow, 2006, released into the public domain.",
    href: "https://commons.wikimedia.org/wiki/File:Odysseus_Sirens_BM_E440_n2.jpg",
    hrefLabel: "Wikimedia Commons",
  },
  {
    n: 4,
    id: "plutarch",
    text: "Plutarch, Life of Theseus 23.1. The Athenians kept the ship, replacing decayed timbers with new ones, and philosophers argued whether it remained the same ship.",
  },
];

export function footnote(id: string): Footnote {
  const f = footnotes.find((x) => x.id === id);
  if (!f) throw new Error(`Unknown footnote ${id}`);
  return f;
}
