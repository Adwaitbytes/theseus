# Conduit (RealWorld) frontend spec

Conduit is a Medium-style blogging app: people sign up, write Markdown articles with tags, follow
authors, favorite articles and comment. This describes what the AngularJS original does, in
platform-neutral terms. Routes use hash URLs (`/#/...`).

## Layout

- A top navigation bar on every page with the brand link "conduit" (goes home).
- Signed out it shows: Home, Sign in, Sign up.
- Signed in it shows: Home, New Article, Settings, and the user's avatar and username (links to
  their profile).
- The current page's nav link is highlighted. The browser tab title is the page name, a dash, then "Conduit" (for example "Home - Conduit", with a long dash).
- A footer with the brand and a credit line.

## Home (`/#/`)

- Signed out: a green banner "conduit / A place to share your knowledge.", then a "Global Feed"
  tab listing every article, newest first.
- Signed in: no banner; two tabs, "Your Feed" (selected by default, only articles by authors the
  user follows) and "Global Feed".
- A "Popular Tags" sidebar lists every tag. Clicking a tag adds a third tab "# <tag>", selects it
  and lists only articles with that tag.
- Each article preview shows the author avatar and username (link to profile), the date
  ("March 8, 2024"), a heart button with the favorites count, the title, the description,
  "Read more..." and the tag pills. Clicking the preview opens the article.
- While loading the list shows "Loading articles..."; an empty list shows
  "No articles are here... yet."
- Lists show 10 articles per page on Home and 5 on profiles. When there is more than one page,
  numbered page links appear under the list; the current page is highlighted and clicking a number
  loads that page.

## Favorite button (heart)

- Signed out, clicking it goes to Sign up.
- Signed in, it toggles: favoriting fills the button and adds 1 to the count, unfavoriting reverts.

## Article (`/#/article/<slug>`)

- Dark banner with the title and the meta row: author avatar, username, date, and actions.
- Actions for someone else's article: "Follow <author>" / "Unfollow <author>" and
  "Favorite Article (<n>)" / "Unfavorite Article (<n>)". Signed out these go to Sign up.
- Actions for your own article: "Edit Article" (opens the editor) and "Delete Article" (deletes,
  then returns home).
- The body is rendered from Markdown, followed by the tag pills, then the meta row again.
- Comments: signed out shows "Sign in or sign up to add comments on this article." Signed in shows
  a "Write a comment..." box with your avatar and a "Post Comment" button; posting adds the comment
  to the top of the list and clears the box.
- Each comment shows its text, author avatar, username and date. Your own comments have a trash
  icon that deletes them.

## Sign in (`/#/login`) and Sign up (`/#/register`)

- Sign in: heading "Sign in", link "Need an account?", fields Email and Password, button "Sign in".
- Sign up: heading "Sign up", link "Have an account?", fields Username, Email and Password, button
  "Sign up".
- Errors appear as a red list above the form, one line per field, e.g. "email is not found" (wrong
  email or password), "username is exist", "password The 'password' field length must be larger
  than or equal to 6 characters long!".
- Success stores the session (it survives a reload) and goes to Home.
- Visiting these pages while signed in redirects Home.

## Editor (`/#/editor/` and `/#/editor/<slug>`)

- Requires sign in. Fields: "Article Title", "What's this article about?",
  "Write your article (in markdown)", "Enter tags", button "Publish Article".
- Typing a tag and pressing Enter adds it as a pill with an x to remove it.
- Publishing opens the new article page. Editing an existing article pre-fills every field and
  saves in place. Editing someone else's article is not allowed (redirects Home).

## Settings (`/#/settings`)

- Requires sign in. Heading "Your Settings". Fields: "URL of profile picture", "Username",
  "Short bio about you", "Email", "New Password", button "Update Settings".
- Saving goes to your profile, which shows the new values.
- "Or click here to logout." signs out and goes Home.

## Profile (`/#/@<username>` and `/#/@<username>/favorites`)

- Header with avatar, username and bio. On someone else's profile a "Follow <name>" /
  "Unfollow <name>" button (signed out it goes to Sign up); on your own an
  "Edit Profile Settings" link.
- Tabs "My Articles" (articles they wrote) and "Favorited Articles" (articles they favorited),
  5 per page with page links.

## Seed data (see README)

alice (6 articles, follows bob), bob (2 articles, favorited "Favorites and counters"), carol (no
articles, 1 comment). Tags: angularjs, migration, testing, realworld, javascript, backend.
