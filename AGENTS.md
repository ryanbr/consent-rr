# Working on consent-rr

Resource replacements for uBlock Origin that stand in for a cookie-consent SDK.
`dist/*.js` is fetched by uBO over a raw URL, so a mistake there reaches everyone
pointed at it. The notes below are the things that have actually gone wrong.

## Layout

- One directory per consent manager under `src/`, shared code in its `lib/`.
  `dist/` stays flat: uBO addresses a resource by name alone. Four families so
  far: `onetrust/`, `cookieinformation/`, `inmobi/`, `osano/`, `civic/` and
  `cookiebot/`, `securiti/` and `transcend/`.
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
- `src/osano/lib/osano-core.js` - the whole of that CMP's surface, because
  Osano ships as one per-tenant file; `.../osano-usp.js` is the CCPA API its
  bundle carries.
- `src/civic/lib/civic-core.js` - the CookieControl object and its cookie;
  `.../civic-tcf.js` is the IAB layer, which only installs where the page's own
  load() config asks for it.
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
- **How a CMP blocks decides how much a stub has to do.** OneTrust and Cookie
  Information park a tag in the markup, so their stubs have to revive the ones a
  decision allows. Osano patches the DOM at runtime instead - `createElement`,
  `setAttribute`, the `src` setters, `document.cookie` - so with it replaced
  there is nothing parked and nothing to revive, and uBO does the blocking. Check
  which kind you have before writing revival code for a CMP that has no parking.
- **The CMP's own cookie format is not yours to choose.** Civic writes its
  record as plain JSON, because `encodeCookie` defaults to false, and sites read
  it back with helpers that do not decode - Goldsmiths runs `JSON.parse` over
  the raw value. Percent-encoding it there means the site parses nothing and
  shows its "you have not consented" placeholder, with no error anywhere. Osano
  is the opposite case (below). Check how the CMP writes it *and* how a real
  site reads it before choosing.
- **A cookie value goes to the server.** Osano's own record is encrypted, so its
  quotes and commas never reach a `Cookie` header; plain JSON in their format
  does, and a strict server-side parser drops the whole header over it. The copy
  in the cookie is percent-encoded for that reason, the one in localStorage - the
  store their reader consults first - is not.
- **A script tag is configuration too.** Cookiebot's `<script id="Cookiebot"
  data-cbid=… data-framework=…>` carries the site's settings, and a redirected
  resource can read them: `document.currentScript` is that element. Injected as
  a scriptlet there is none, so fall back to the lookup their own code does.
- **Record the decision through the CMP's own API where it has one.** Transcend
  splits into an engine that blocks and a banner that asks; replacing the banner
  and calling `airgap.setConsent` leaves the engine in place to enforce the
  refusal, which is better than anything a stub could do instead. Look for that
  split before deciding what to replace - Securiti's auto-blocker is the same
  shape, and nooping either would weaken the result.
- **And some keep it on a server.** Securiti's categories are per-tenant ids
  fetched from their CDN, so a refusal cannot name them - but it does not have
  to: their readers ask whether an id is set in the record's map, and an empty
  map refuses every id there could be. Look for the shape of the *question*
  before concluding you need the data to answer it.
- **Some CMPs hand you the configuration.** Civic's page calls
  `CookieControl.load({...})` with its categories, callbacks and cookie settings
  inline, and InMobi's `choice.js` passes a `coreConfig` through the TCF stub's
  queue. Where that exists, take the values from it rather than defaulting: the
  refusal then names the site's own categories, and the IAB layer goes in only
  where the site asked for one. Check for it before writing a fallback.
- **The same CMP ships a different bundle per tenant.** Osano's per-tenant file
  ends `C({usp: ...})` where the IAB module is off and
  `C({gpp: ..., tcf: ..., usp: ...})` where it is on - so one tenant's copy
  installs `__uspapi` alone and another's installs all three. Three sampled
  tenants agreed on all twenty structural checks and differed on exactly that,
  so check the module init at the tail of a second tenant's bundle before
  concluding which APIs a stub has to put back.
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

**Most pushes are not releases.** Push as often as you like; a version is only
for a push that changes what a user fetches. Everything else - a filter list, the
README, a test, a tool - lands on `main` with no bump, no tag and no release.

The other side of that: a release needs a version of its own, always. npm will
not take a version twice, so publishing is what a bump is for - the question is
never whether to bump a release, only whether this push is one.

So before reaching for `npm version`, check there is anything to ship:

```sh
git status --short dist/                 # a new resource is untracked
git diff --stat <last tag> -- dist/      # both empty means do not bump
```

Both of them, because `git diff` against a tag cannot see an untracked file, so
a whole new resource looks like nothing to ship.

Empty means the resources are byte-identical to the last release, pinned URLs
still serve the right file, and a new version would only move the pins and
publish release notes for a file nobody needs again. 1.18.1 was released that
way by mistake; it shipped a filter line and two paragraphs.

The pins come in two shapes now - `consent-rr/v<version>/` for raw GitHub and
the name, an `@`, the version and a slash for the CDNs - and a bump has to move
both. The build fails on either being stale, which is how the CDN pair was
caught. Do not sweep a version string across these files blindly: the sentence
above names a release rather than pinning one, and a sweep rewrote it to say
the wrong release had been the mistake.

Each consent manager has its own version under `resourceVersions` in
`package.json`; the repo's `version` is what releases are named after. Bump the
family's entry when its resources change, and not otherwise - a version on a stub
means that stub changed.

When `dist/` really has changed:

```sh
# bump resourceVersions.<family> if that family's resources changed
npm pkg set version=1.2.5                   # the repo's own version
# bump the pinned URLs in README.md - the build refuses to run otherwise
npm run build && npm test
git commit -a && git tag -a v1.2.5 -m '1.2.5 - what changed'
git push origin main --follow-tags
gh release create v1.2.5 --verify-tag --title v1.2.5 --notes-file notes.md
```

`npm pkg set` rather than `npm version`, because `npm version` rewrites the
root version in `package-lock.json` too and that lands two lines of noise in
every release commit. Nothing needs them in step: `npm ci` installs fine with
the lockfile naming an older version of the project itself - it only checks
dependencies - and `npm publish` reads `package.json`. An `npm install` will
re-sync it eventually; let it, rather than carrying it in the release.

Tags sit on the last commit carrying a version, which is the state that shipped.

Publishing the GitHub release runs `.github/workflows/publish.yml`, which puts
the same version on npm with `NPM_TOKEN`. It bumps nothing: it publishes what
the tag carries, and refuses if the tag and `package.json` disagree, if the
committed `dist/` is stale, or if the suite fails. A version already on npm is a
no-op rather than a failure, because a release can be published twice and npm
versions cannot be replaced.

npm matters here because jsDelivr and unpkg then serve every resource at a
pinned url, which is a second place a uBO user resource can point at. Those urls
pin with the name, an `@`, the version and a slash, and the pin check in
`tools/build.mjs` reads that shape as well as the raw-GitHub one, so a stale CDN
url in the docs fails the build the same way. (Writing one of those urls here
with a version in it would itself fail the check, which is the check working.)

## Commits

Authored `ryanbr <mp3geek@gmail.com>`. No AI attribution trailers, no
`Co-Authored-By`. Write what changed and why it was wrong before, in prose; the
commit log here is the design record.
