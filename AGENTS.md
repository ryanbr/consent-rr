# Working on consent-rr

Resource replacements for uBlock Origin that stand in for a cookie-consent SDK.
`dist/*.js` is fetched by uBO over a raw URL, so a mistake there reaches everyone
pointed at it. The notes below are the things that have actually gone wrong.

## Layout

- One directory per consent manager under `src/`, shared code in its `lib/`.
  `dist/` stays flat: uBO addresses a resource by name alone. Three families so
  far, `onetrust/`, `cookieinformation/` and `inmobi/`.
- `src/onetrust/lib/onetrust-core.js` - OneTrust's own API, cookies, banner
  removal, tag revival. Shared by its resources.
- `src/onetrust/lib/onetrust-tcf.js`, `.../onetrust-gpp.js` - the IAB layers.
- `src/onetrust/onetrust-*.js` - entry points, pulled
  together by `// @include` lines. **The two built files differ by one line**, the
  mode argument; a test asserts that, so anything landing in one and not the other
  is a bug.
- `src/inmobi/lib/inmobi-core.js` - the config hand-off, cookies and the CCPA
  API; `.../inmobi-tcf.js` and `.../inmobi-gpp.js` are the IAB layers, and this
  CMP is nothing but those.
- `tools/build.mjs` - bundles, substitutes, and refuses to ship what uBO cannot
  parse. `npm run build`.
- `dist/` is committed, because that is what uBO fetches. CI fails when it does
  not match `src/`.

## The resources format will bite you

uBO parses these line by line (`RedirectEngine.resourcesFromString`):

- **a blank line ends a resource** - one inside the code truncates it silently
- a line starting with `// ` or `#` is **dropped**, comments included
- `/// name.js` is the header, and is also a JavaScript comment, which is why one
  file is both a resources file and a readable script
- user resources have no extension URL, so uBO serves them as
  `data:text/javascript;base64,` via `btoa()`: **ASCII only**
- sources may not use template literals, because the bundler strips lines

The build enforces all of it, plus that `@@VERSION@@` was substituted and that
the README's pinned URLs name the version being built. Don't defeat those checks;
they have each caught a real mistake.

## When a redirect silently does nothing

A redirected resource is served as a `data:` URI, so a page whose CSP omits
`data:` for scripts refuses it. Nothing runs, and because the real SDK was
replaced at the network layer the banner is gone as well, which reads as success.
Check `<cmp>.consentRR` in the console: undefined means it never ran. The
scriptlet form is not fetched and is not subject to that directive, so pair the
two - the redirect to keep the SDK out, `##+js(<resource>)` to supply the stub.

## Filters

- `+js(onetrust-reject)` - **no `.js`**. uBO appends it, so `+js(name.js)`
  resolves to `name.js.js`, finds nothing, and injects nothing. Silently: uBO
  wraps scriptlets in `try {} catch {}` with an empty handler.
- `redirect=onetrust-reject.js` - **with** `.js`. Redirect tokens are the resource
  name verbatim.
- Match by filename, not host and path: the SDK rewrites its own URL for migrated
  tenants and is served from several CDNs.
- Another list's `@@` exception beats a plain `$redirect`; `important` is needed
  to override one.
- Two tests read every list in `filters/` and check each token against the above,
  for every family in `resourceVersions` - so a list added for a new consent
  manager is held to the same rules rather than skipped by them.
- **Where the replacement goes matters.** InMobi's `choice.js` hands `cmp2.js`
  the tenant configuration through the page's stub queue, so the redirect belongs
  on `cmp2.js`: taking out `choice.js` instead means no config to read, and
  another list blocking `choice.js` means `cmp2.js` is never requested and the
  redirect never fires at all. A test asserts the list targets `cmp2.js`.

## Fidelity comes from evidence, not from prose

Every value in here was read off the SDK that is being replaced - OneTrust's
`otSDKStub.js` / `otBannerSdk.js` / `otTCF.js`, Cookie Information's `uc.js`,
InMobi's `choice.js` / `cmp2.js` - off the IAB reference libraries, or off real
cookies captured from a real click. **Don't add a value because a spec or a doc page says so** - the docs
disagree with the shipped SDK in several places (`InsertHTML` vs `InsertHtml`,
`getGPPData` which is not a GPP 1.1 command at all).

- The SDK's files are third-party: fetch them from `cdn.cookielaw.org` into a
  scratchpad if you need them, never commit them.
- TC and GPP strings are validated by `@iabtcf/core` and `@iabgpp/cmpapi` in the
  tests. Never hand-assert a string; derive it and let the library decode it.
- **Don't over-fit to one sample.** `publisherCC` was changed to `DE` on two
  samples and a third said `US`; purpose-level legitimate interest was changed on
  one sample and two others disagreed. Both had to be reverted.
- Read the CMP's own bootstrap before deciding what to install. `cmp2.js` finds
  its configuration by calling `window.__tcfapi()` with no arguments and taking
  the `init` entry's fourth argument; both it and `window.__gpp()` drain a stub's
  queue that way. That convention is why the InMobi resource can be tenant-
  accurate at all, and it is not in any documentation.
- What varies per tenant is left alone deliberately: `publisherCC`, publisher
  restrictions, how many vendors keep legitimate interest, the tenant's consent
  language, whether Google vendors are enabled. None is derivable from a page.
- Categories and cookie fields are a deliberate superset, so a site asking about
  one its tenant never defined still gets an answer.

## Testing

`npm test` builds, then runs the suite **against `dist/`**, parsed with uBO's own
line rules and joined the way uBO joins several resource URLs.

- **Mutation-test anything you add.** Break the code the test covers and watch it
  fail. Three tests here passed for weeks against the wrong thing: they were
  satisfied by the document-ready full scan, not by the observer they claimed to
  test, and deleting the observer left them green.
- A surviving mutation is not automatically a coverage gap - check the mutation
  actually disabled the behaviour. Zeroing `maxVendorId` changes nothing because
  the decoder reads the range entries.
- jsdom quirks that will waste your time: `deepStrictEqual` fails on objects from
  the page's realm (JSON round-trip instead); a `MessageEvent`'s `source` cannot
  be a stand-in window (define the property on the event); `document.cookie` does
  not expose a cookie's scope (use `dom.cookieJar`).

## Releasing

Each consent manager has its own version under `resourceVersions` in
`package.json`; the repo's `version` is what releases are named after. Bump the
family's entry when its resources change, and not otherwise - a version on a stub
means that stub changed.

```sh
# bump resourceVersions.<family> if that family's resources changed
npm version patch --no-git-tag-version      # the repo's own version
# bump the pinned URLs in README.md - the build refuses to run otherwise
npm run build && npm test
git commit -a && git tag -a v1.2.5 -m '1.2.5 - what changed'
git push origin main --follow-tags
gh release create v1.2.5 --verify-tag --title v1.2.5 --notes-file notes.md
```

Tags sit on the last commit carrying a version, which is the state that shipped.

## Commits

Authored `ryanbr <mp3geek@gmail.com>`. No AI attribution trailers, no
`Co-Authored-By`. Write what changed and why it was wrong before, in prose; the
commit log here is the design record.
