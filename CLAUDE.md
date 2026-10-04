# CLAUDE.md

**[AGENTS.md](AGENTS.md) is the single source for how to work in this repo.** Read
it before changing anything; it is not long, and everything in it is there because
it went wrong once.

The five that break things silently, with no error anywhere:

- A **blank line** in a built resource truncates it - uBO's parser ends a resource
  there. So do lines starting with `// ` or `#`, which it drops.
- Resources must stay **ASCII**: uBO base64-encodes user resources with `btoa()`.
- `+js(onetrust-reject)` takes **no `.js`** (uBO appends it); `redirect=` takes the
  full `onetrust-reject.js`. A wrong token injects nothing and says nothing,
  because uBO wraps scriptlets in an empty `catch`.
- `dist/` is committed and is what uBO fetches. Rebuild and commit it, or CI fails
  and users keep the old stub.
- **Dispatch a CMP's events where the CMP does.** CookieScript's own `s()` fires
  them at `document` with `bubbles`, and pages hook them with
  `document.addEventListener`. Firing at `window` instead reaches nobody, because
  an event dispatched at `window` never travels down to `document` - and a test
  that listens on `window` hears both, so it cannot tell.

- **A page's element ids are named properties of the window.** A CMP tag with
  `id="foo"` makes `window.foo` that script element, so a stub that adopts
  "the object already there" can hang its API on a DOM node. It throws nothing
  and the page quietly replaces it.

And the habit that matters most: **mutation-test every test you write.** Tests in
here have passed against the wrong code path twice, both times because something
else did the work the test credited to the code under test: a `window` listener
hearing a bubbling `document` event, and jsdom delivering `DOMContentLoaded` in
the same turn as an insertion, so a ready-event sweep freed what an observer was
being tested for. Delete the thing you are testing; if the suite stays green,
the test is pointed at the wrong code.

One more, from the same round: **a re-review finding that makes a resource do
_less_ is a behaviour change, not a cleanup.** Matching a CMP's selector exactly
can stop freeing something a real page needs. Those need field evidence before
they ship; see AGENTS.md.
