# RealWorld Conduit, AngularJS original

The RealWorld "Conduit" Medium clone with its legacy AngularJS 1.x frontend and a local
RealWorld API backend, vendored so it runs offline from a fixed seed.

| Part | Upstream | Commit |
| --- | --- | --- |
| Frontend | [gothinkster/angularjs-realworld-example-app](https://github.com/gothinkster/angularjs-realworld-example-app) (MIT) | `08755ca543e13cb26bc7086d0596ad58567a6f78` |
| Backend | [gothinkster/moleculer-node-realworld-example-app](https://github.com/gothinkster/moleculer-node-realworld-example-app) (MIT) | `6ed71b63587d373cf395dac72107c567498c6b22` |

Each `original/*/UPSTREAM` file lists the small local changes needed to run on current Node.

## Start

```sh
node examples/realworld-angularjs/start.mjs
```

Needs Node 20 or newer and no Docker. The first run installs the backend's dependencies with
`npm ci`. Each start rewrites the database from the seed, then prints:

```
Conduit (AngularJS) ready at http://localhost:4171 (API http://localhost:4180/api, reset: POST http://localhost:4171/__theseus/reset)
```

- Frontend: http://localhost:4171 (prebuilt bundle in `original/frontend/build`)
- API: http://localhost:4180/api (a small proxy that answers CORS preflights and returns spec-shaped
  422 errors, in front of the Moleculer backend on 4181)
- Backend log: `.runtime/backend.log`

## Reset between Kane runs

Either of these restores the exact seed (it restarts the backend on fresh data files, about 0.3 s):

```sh
curl -X POST http://localhost:4171/__theseus/reset
node examples/realworld-angularjs/start.mjs --reset
```

`--reset` calls the endpoint when the app is running, and otherwise rewrites the data files. The
browser keeps its session token in localStorage; a token for a seed user stays valid across resets.

## Seed accounts (demo only, not real people)

All three sign in with the password `conduit-demo`.

| Username | Email | Seed state |
| --- | --- | --- |
| alice | alice@example.com | 6 articles (two pages on her profile), follows bob |
| bob | bob@example.com | 2 articles, has favorited "Favorites and counters" |
| carol | carol@example.com | no articles, one comment, empty Your Feed |

8 articles in all, tags `angularjs`, `migration`, `testing`, `realworld`, `javascript`, `backend`,
3 comments (two on "How to retire an AngularJS app").

## Rebuild the frontend

`start.mjs` never builds. After changing `original/frontend/src`:

```sh
cd examples/realworld-angularjs/original/frontend && npm install
node ../../tools/build-frontend.mjs
```

## Known quirks of the original

These are upstream behaviors, kept on purpose:

- New article slugs end in a random suffix (`carol-writes-her-first-post-y1vhb9`), so only seed
  slugs are stable.
- A wrong password reports "email is not found", the same as an unknown email.
- A new user has no avatar; right after signing up, the header can keep showing the previous
  user's picture until a reload.
- Home never paginates with the seed (8 articles, 10 per page); profile pagination does (alice).

`proof/` holds screenshots of a full walkthrough against this seed.
