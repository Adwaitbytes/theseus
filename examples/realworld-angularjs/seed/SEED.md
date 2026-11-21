# Conduit seed data

Every run starts from exactly this data. It is restored by `POST /__theseus/reset`, which
discards every change made since (new users, articles, comments, follows, favorites, settings).
Source of truth: `seed/seed.mjs`. These are demo accounts, not real people.

## Accounts

All three accounts sign in with the password `conduit-demo`.

| Username | Email | Password | Bio | Avatar |
| --- | --- | --- | --- | --- |
| alice | alice@example.com | conduit-demo | Writes about legacy frontends and how to retire them gracefully. | green square with a white "A" |
| bob | bob@example.com | conduit-demo | Backend person. Prefers boring databases. | blue square with a white "B" |
| carol | carol@example.com | conduit-demo | (empty) | purple square with a white "C" |

Avatars are 128 by 128 squares: alice `#5CB85C`, bob `#3D8BCD`, carol `#B85C9E`, each with the
user's initial in bold white.

## Articles

8 articles. Lists show them newest first, so the global feed starts with "Favorites and counters"
and ends with "How to retire an AngularJS app". Dates are shown as long dates (for example
"March 8, 2024"). Only "Favorites and counters" has a favorite; every other count is 0.

| # | Slug | Title | Description | Tags (in order) | Author | Created | Favorites |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | how-to-retire-an-angularjs-app | How to retire an AngularJS app | A field guide to moving off a framework that reached end of life. | angularjs, migration | alice | March 1, 2024 | 0 |
| 2 | testing-in-plain-english | Testing in plain English | Behavior specs anyone on the team can read. | testing | alice | March 2, 2024 | 0 |
| 3 | a-tour-of-the-realworld-spec | A tour of the RealWorld spec | Conduit is a Medium clone with a shared API contract. | realworld, javascript | alice | March 3, 2024 | 0 |
| 4 | markdown-in-article-bodies | Markdown in article bodies | Bodies are stored as Markdown and rendered on the article page. | realworld | alice | March 4, 2024 | 0 |
| 5 | boring-databases-win | Boring databases win | Why the dull choice is usually the right one. | backend, javascript | bob | March 5, 2024 | 0 |
| 6 | pagination-without-surprises | Pagination without surprises | Offsets, limits and counts that agree with each other. | javascript | alice | March 6, 2024 | 0 |
| 7 | designing-a-follow-feed | Designing a follow feed | Your Feed shows only authors you follow. | backend, realworld | bob | March 7, 2024 | 0 |
| 8 | favorites-and-counters | Favorites and counters | Keeping the heart count honest. | testing, javascript | alice | March 8, 2024 | 1 (bob) |

### Article bodies (Markdown, exact)

1. How to retire an AngularJS app: a paragraph "AngularJS reached end of life in 2022.", a level 2
   heading "Start with behavior", a paragraph "Write down what the app does before you touch a line
   of it.", then a bullet list "List every route", "List every form", "List every state change".
2. Testing in plain English: "A good test reads like a sentence: *sign in, open an article, post a
   comment, see it appear*." (the part after the colon is italic).
3. A tour of the RealWorld spec: "Every RealWorld frontend talks to the same API, so any frontend
   can pair with any backend."
4. Markdown in article bodies: a level 1 heading "Heading", a paragraph "Some **bold** text, some
   *italic* text and a list:", then a numbered list "One", "Two", "Three".
5. Boring databases win: "Pick the database your team already knows how to back up and restore."
6. Pagination without surprises: "Return the total count with every page so the client can draw
   the page links."
7. Designing a follow feed: "A feed is just a list query filtered by the authors the reader
   follows, newest first."
8. Favorites and counters: "Favoriting toggles. The counter goes up by one, and back down by one
   when you undo it."

### Tags

Six distinct tags, listed under Popular Tags in this order: angularjs, migration, testing,
realworld, javascript, backend.
Articles per tag: javascript 4, realworld 3, testing 2, backend 2, angularjs 1, migration 1.

## Comments

3 comments, listed newest first on the article page.

| Article | Author | Created | Text |
| --- | --- | --- | --- |
| How to retire an AngularJS app | carol | March 9, 2024 | How long did the whole migration take? |
| How to retire an AngularJS app | bob | March 9, 2024 | We did exactly this last year. Writing the behaviors first saved us. |
| Boring databases win | alice | March 9, 2024 | Agreed, boring is a feature. |

Every other article has no comments.

## Follows

- alice follows bob. So alice's Your Feed lists bob's two articles, newest first: "Designing a
  follow feed", then "Boring databases win".
- Nobody else follows anyone. bob's and carol's Your Feed are empty.

## Favorites

- bob has favorited "Favorites and counters" (count 1). bob's Favorited Articles tab lists only
  that article.
- alice and carol have favorited nothing.

## What each account sees

| Account | Profile: My Articles | Favorited Articles | Your Feed |
| --- | --- | --- | --- |
| alice | 6 articles, 5 per page, so two pages | none | Designing a follow feed, Boring databases win |
| bob | Designing a follow feed, Boring databases win | Favorites and counters | empty |
| carol | none | none | empty |

The home feeds show 10 articles per page, so the 8 seed articles fit on one page.
