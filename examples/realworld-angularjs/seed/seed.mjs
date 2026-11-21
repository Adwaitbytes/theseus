// The fixed demo dataset, written straight into the backend's NeDB files so every reset yields
// byte-identical data: fixed ids, fixed timestamps, fixed slugs and a precomputed bcrypt hash.
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Every seed account signs in with this password. It is a demo value, never a real secret. */
export const SEED_PASSWORD = "conduit-demo";
const SEED_PASSWORD_HASH = "$2b$10$F/fBzjnW8y9MF56SC88iVuZXMxZPq6IeFMcZ3IKHfrKAMyrOo50pS";

const COLLECTIONS = ["users", "articles", "comments", "favorites", "follows"];

const at = (iso) => ({ $$date: Date.parse(iso) });

export function seedUsers(frontendOrigin) {
  const avatar = (name) => `${frontendOrigin}/__theseus/avatars/${name}.svg`;
  return [
    {
      _id: "user0000alice001",
      username: "alice",
      email: "alice@example.com",
      password: SEED_PASSWORD_HASH,
      bio: "Writes about legacy frontends and how to retire them gracefully.",
      image: avatar("alice"),
      createdAt: at("2024-01-02T09:00:00Z"),
    },
    {
      _id: "user00000bob0002",
      username: "bob",
      email: "bob@example.com",
      password: SEED_PASSWORD_HASH,
      bio: "Backend person. Prefers boring databases.",
      image: avatar("bob"),
      createdAt: at("2024-01-03T09:00:00Z"),
    },
    {
      _id: "user0000carol003",
      username: "carol",
      email: "carol@example.com",
      password: SEED_PASSWORD_HASH,
      bio: "",
      image: avatar("carol"),
      createdAt: at("2024-01-04T09:00:00Z"),
    },
  ];
}

const ALICE = "user0000alice001";
const BOB = "user00000bob0002";
const CAROL = "user0000carol003";

const article = (id, author, slug, title, description, tagList, created, body) => ({
  _id: id,
  slug,
  title,
  description,
  body,
  tagList,
  author,
  createdAt: at(created),
  updatedAt: at(created),
});

export const SEED_ARTICLES = [
  article(
    "article000000001",
    ALICE,
    "how-to-retire-an-angularjs-app",
    "How to retire an AngularJS app",
    "A field guide to moving off a framework that reached end of life.",
    ["angularjs", "migration"],
    "2024-03-01T10:00:00Z",
    "AngularJS reached end of life in 2022.\n\n## Start with behavior\n\nWrite down what the app does before you touch a line of it.\n\n- List every route\n- List every form\n- List every state change",
  ),
  article(
    "article000000002",
    ALICE,
    "testing-in-plain-english",
    "Testing in plain English",
    "Behavior specs anyone on the team can read.",
    ["testing"],
    "2024-03-02T10:00:00Z",
    "A good test reads like a sentence: *sign in, open an article, post a comment, see it appear*.",
  ),
  article(
    "article000000003",
    ALICE,
    "a-tour-of-the-realworld-spec",
    "A tour of the RealWorld spec",
    "Conduit is a Medium clone with a shared API contract.",
    ["realworld", "javascript"],
    "2024-03-03T10:00:00Z",
    "Every RealWorld frontend talks to the same API, so any frontend can pair with any backend.",
  ),
  article(
    "article000000004",
    ALICE,
    "markdown-in-article-bodies",
    "Markdown in article bodies",
    "Bodies are stored as Markdown and rendered on the article page.",
    ["realworld"],
    "2024-03-04T10:00:00Z",
    "# Heading\n\nSome **bold** text, some *italic* text and a list:\n\n1. One\n2. Two\n3. Three",
  ),
  article(
    "article000000005",
    BOB,
    "boring-databases-win",
    "Boring databases win",
    "Why the dull choice is usually the right one.",
    ["backend", "javascript"],
    "2024-03-05T10:00:00Z",
    "Pick the database your team already knows how to back up and restore.",
  ),
  article(
    "article000000006",
    ALICE,
    "pagination-without-surprises",
    "Pagination without surprises",
    "Offsets, limits and counts that agree with each other.",
    ["javascript"],
    "2024-03-06T10:00:00Z",
    "Return the total count with every page so the client can draw the page links.",
  ),
  article(
    "article000000007",
    BOB,
    "designing-a-follow-feed",
    "Designing a follow feed",
    "Your Feed shows only authors you follow.",
    ["backend", "realworld"],
    "2024-03-07T10:00:00Z",
    "A feed is just a list query filtered by the authors the reader follows, newest first.",
  ),
  article(
    "article000000008",
    ALICE,
    "favorites-and-counters",
    "Favorites and counters",
    "Keeping the heart count honest.",
    ["testing", "javascript"],
    "2024-03-08T10:00:00Z",
    "Favoriting toggles. The counter goes up by one, and back down by one when you undo it.",
  ),
];

export const SEED_COMMENTS = [
  {
    _id: "comment000000001",
    article: "article000000001",
    author: BOB,
    body: "We did exactly this last year. Writing the behaviors first saved us.",
    createdAt: at("2024-03-09T10:00:00Z"),
    updatedAt: at("2024-03-09T10:00:00Z"),
  },
  {
    _id: "comment000000002",
    article: "article000000001",
    author: CAROL,
    body: "How long did the whole migration take?",
    createdAt: at("2024-03-09T11:00:00Z"),
    updatedAt: at("2024-03-09T11:00:00Z"),
  },
  {
    _id: "comment000000003",
    article: "article000000005",
    author: ALICE,
    body: "Agreed, boring is a feature.",
    createdAt: at("2024-03-09T12:00:00Z"),
    updatedAt: at("2024-03-09T12:00:00Z"),
  },
];

/** alice follows bob, so alice's Your Feed lists bob's two articles. */
export const SEED_FOLLOWS = [{ _id: "follow0000000001", user: ALICE, follow: BOB, createdAt: at("2024-03-10T10:00:00Z") }];

/** bob has favorited alice's newest article, so it shows a count of 1. */
export const SEED_FAVORITES = [
  { _id: "favorite00000001", user: BOB, article: "article000000008", createdAt: at("2024-03-10T11:00:00Z") },
];

const toNedb = (docs) => docs.map((doc) => JSON.stringify(doc)).join("\n") + "\n";

/** Replaces the backend's data directory with the seed. The backend must not be running. */
export async function writeSeed(dataDir, frontendOrigin) {
  await rm(dataDir, { recursive: true, force: true });
  await mkdir(dataDir, { recursive: true });
  const contents = {
    users: seedUsers(frontendOrigin),
    articles: SEED_ARTICLES,
    comments: SEED_COMMENTS,
    favorites: SEED_FAVORITES,
    follows: SEED_FOLLOWS,
  };
  await Promise.all(COLLECTIONS.map((name) => writeFile(join(dataDir, `${name}.db`), toNedb(contents[name]))));
}
