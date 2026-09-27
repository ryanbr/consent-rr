# CLAUDE.md

**[AGENTS.md](AGENTS.md) is the single source for how to work in this repo.** Read
it before changing anything; it is not long, and everything in it is there because
it went wrong once.

The four that break things silently, with no error anywhere:

- A **blank line** in a built resource truncates it - uBO's parser ends a resource
  there. So do lines starting with `// ` or `#`, which it drops.
- Resources must stay **ASCII**: uBO base64-encodes user resources with `btoa()`.
- `+js(onetrust-reject)` takes **no `.js`** (uBO appends it); `redirect=` takes the
  full `onetrust-reject.js`. A wrong token injects nothing and says nothing,
  because uBO wraps scriptlets in an empty `catch`.
- `dist/` is committed and is what uBO fetches. Rebuild and commit it, or CI fails
  and users keep the old stub.

And the habit that matters most: **mutation-test every test you write.** Tests in
here have passed against the wrong code path before now.
