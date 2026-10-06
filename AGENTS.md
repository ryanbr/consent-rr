# Working on consent-rr

Resource replacements for uBlock Origin that stand in for a cookie-consent SDK.
`dist/*.js` is fetched by uBO over a raw URL, so a mistake there reaches everyone
pointed at it. The notes below are the things that have actually gone wrong.

## Layout

- One directory per consent manager under `src/`, shared code in its `lib/`.
  `dist/` stays flat: uBO addresses a resource by name alone. Twenty-six
  families so far; `ls src/` is the list, and `src/shared/` is the one
  directory there that is not a consent manager.
- `src/shared/lib/deferred.js` - the only cross-family lib: running a pass
  over the document again as the document arrives, for every resource that
  frees tags a CMP parked. Included by the family core that needs it, with a
  relative `// @include ../../shared/lib/deferred.js`; nested includes resolve
  relative to the including file, so a core can pull in a lib of its own.
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
- **Read the CMP's decision path to its last call.** CookieScript's refusal
  paths `qt()` and `yt()` both end in `oe()`, which is `window.location.reload()`
  - and its loader opens with `Mt()`, which removes banner markup the page may
  already carry, a `position: fixed` full-screen dialog among it. Four releases
  wrote a perfect record while the page stayed broken, because the record was
  never the part that mattered: tags are parked in markup rendered before any
  decision existed, and only a fresh render brings them back. Grep a new family
  for `location.reload`, `removeChild` and the teardown that runs before they
  inject anything. A reload needs guards - no prior decision, the record
  verifiably written, top document, a one-shot marker - and the document hidden
  while it is in flight, or the page paints unstyled first.
- **Where the CMP dispatches, dispatch.** CookieScript's `s()` fires at
  `window.document` with `bubbles`; firing at `window` reaches no page listener.
  CookieScript is the odd one - Cookiebot and Usercentrics both fire at `window`
  - so check the vendor's own dispatcher rather than copying a sibling resource.
- **A tenant can rename what you write.** CookieScript's `j()` takes the consent
  cookie's *name* off a `script[data-cs-cookiename]` attribute and only then
  falls back to `CookieScriptConsent`. A redirected script keeps its attributes
  in the document, so read them; hardcoding the default writes a record nothing
  reads, on a page that looks fine otherwise.
- **Matching a selector exactly can do more harm than approximating it.**
  CookieScript's refusal reaches its unblocker as `k(['strict'])`, and with a
  non-empty list their selector requires `[data-cookiecategory]` to be present,
  their script selector wanting `type="text/plain"` besides. A re-review matched
  that and broke a page that had been working, because the element it needs
  carries no category. Freeing is decided on the category rule alone now, with
  the refusal invariant kept explicit instead: a declared category must be the
  never-refused one, and the CMP's own bucket for unidentified trackers
  (`unclassified`) stays refused. **Any finding that makes a resource do less
  needs field evidence, not just a reading of the SDK.**
- **Assert every string replacement, or a header ends up describing another
  CMP.** cookieyes-tcf.js was written by adapting the Funding Choices one, and
  the replacement of its comment block silently did not match - so three
  releases carried a module whose header said "The IAB layer for Google
  Funding Choices", cmpId 300, FCCDCF, while the code correctly used 401. The
  code was covered by tests; the prose was covered by nothing. Every edit that
  rewrites a block has to assert the old text was there AND assert the new
  text is, and a module adapted from another family needs its header re-read
  before it ships. Auditing all twenty families afterwards found no second
  case - every other cross-family mention was a deliberate comparison - which
  is worth knowing too.
- **A hash in the record is a policy id by another name.** Cookiez stores a
  cookiesHash in its record's meta and throws the whole record away when it
  does not match window.cookiezBannerSettings.cookiesHash - or when it is
  older than consentExpiration days - and then the banner comes back. That is
  the Complianz policy_id trap in a different shape, and the third family
  where a record only counts if it carries something the page declares. When a
  record has a meta block, find what reads it before assuming the consent
  fields are the whole story.
- **A CMP may have no API at all, and then the restraint is the work.**
  Cookiez dispatches no event of any kind and sets one global, which is banner
  internals that exist only when a banner is built. There was nothing to put
  up, so nothing was put up. Coming straight off a family where an invented
  surface shipped, the useful instinct is the opposite one: grep for
  dispatchEvent and for window.<name> assignments, and if they are not there,
  write down that they are not.
- **A second-evaluation test needs something that changes.** The Cookiez guard
  survived its mutation because the test compared a timestamp the CMP keeps in
  SECONDS, so two runs in the same second look identical. Count the bridge
  calls, or the events, or anything that increments.
- **Measure the payload, not just the command names.** The consentmanager
  resource shipped with a getCMPData of twenty invented field names: purposeLIs
  for their purposeLI, hasGlobalConsent for their hasGlobalScope, a cmpId their
  payload does not carry at all, and a dozen more. It also answered ONE payload
  for every command, where theirs answers a different object per command -
  getConsentData is three fields, getVendorConsents carries a custom pair,
  getVendorList answers {}, and a ping of any version but 2 answers false. And
  seventeen of the twenty-six methods it put on their manager object do not
  exist in their bundle, which is a page feature-detecting its way down a path
  the CMP never offered. Reading a command LIST out of a minified file is easy
  and proves nothing about the shapes; pull the object literal each one
  returns, and check where the methods actually hang - theirs are on
  cmpmngr.api, not cmpmngr. Nine tests failed when this was corrected, because
  they were pinning the invention.
- **Find out who reads a record before writing one.** consentmanager's own
  consent cookie is named from a consentscope and a tenant id that live only
  in the 493KB bundle being replaced, and grepping their bootstrap, their
  cmp.php and both tenants' custom data shows nothing else reads it. So it is
  not written, while euconsent-v2 - which their bundle also writes, and which
  a third party reads without asking any API - is. The split is the opposite
  of Funding Choices, where the cookie was everything and there was no API at
  all. Grep the consumers first; the answer differs per family.
- **A loader can be domain-locked, and then nothing you boot tells you
  anything.** CookieYes inlines the registered domain in
  client_data/<id>/script.js and compares it to location.hostname by suffix,
  throwing "Looks like your website URL has changed" on a mismatch - so a
  tenant's file booted on a test fixture defines a couple of globals and
  stops. Read the file for the domain it expects (it is in there, in the
  clear) and boot on that, or every measurement is of the error path. The same
  trick appears as a per-page token elsewhere: Funding Choices' /l/ url answers
  403 to anything but the page it was minted for.
- **Free only what the CMP itself parked.** A script with type="text/plain"
  might be a template's, another CMP's, or the page's own data; CookieYes
  parks with its own data-cookieyes attribute and with the
  javascript/blocked type its blocker writes. Matching the bare type as well
  would have this repo running code nobody asked it to - the opposite error
  to the cookiescript one, and just as much a behaviour change.
- **Where a CMP types its services, the type is the cut.** tarteaucitron
  gives every one of its 247 services a type - analytic, ads, api, video,
  support, other, social, google, comment - and its own respondAll takes a
  type to act on, so "keep the videos, refuse the trackers" is their model
  rather than a guess of ours. Count them before choosing: 67 analytic and 51
  ads against 26 video and 21 social is what makes the cut worth having.
- **Two of a vendor's own bundles can disagree, and replacing a build takes
  its answers with it.** tarteaucitron types acast "other" in info.gouv.fr's
  self-hosted build and "video" in their CDN's services bundle at the same
  version. A reader's real record from that page refuses it; the registry the
  unblock variant falls back to would have allowed it. So when a resource
  replaces a site's own file and then fetches the vendor's generic one to
  replace what it lost, check that the generic one is not the more permissive
  of the two - and when it is, say which name and why, in the code. Before
  concluding that a vendor's classification contradicts a field record, line
  the record up with the deployment it came from: the first reading here had
  the right answer for the wrong reason.
- **A consent a resource cannot act on is worse than a refusal.** Consenting
  to a tarteaucitron video does nothing on its own: the embed is built by that
  service's own launcher, services[key].js(), and that launcher reaches its
  elements through the replaced file's OWN helpers - fallback, getElemAttr,
  getStyleSize, addScript. Stub those and a consented video still never
  appears. Implement them, and their launchers run unchanged. Where the
  registry of launchers is not on the page, fetch the one file the replaced
  script fetches itself - and refuse anything whose type is not known yet, so
  a registry that never arrives fails closed rather than open.
- **A refusal can be the absence of a record, and then clearing it is the
  whole job.** Google Funding Choices has no API the ad stack reads: gpt.js and
  adsbygoogle.js each read exactly one thing, the FCCDCF cookie, and take the
  TC string out of its field 4. No cookie means no TC string, so writing a
  refusal there would mean minting a consent string - while writing nothing at
  all leaves a visitor who consented before installing the resource with a
  record that still says yes, for about thirteen months. So that resource
  writes nothing and clears theirs, on the host and on every registrable
  domain above it, because the domain a cookie was set with is not readable.
  Before building a record for a new family, grep the consumer - the ad or
  tag script that reads it - and find out whether it reads an API at all.
  **And expect more than one consumer, wanting different answers.** The same
  resource answers __tcfapi with a refusal, because a page-side vendor waiting
  on a CMP waits forever otherwise, while leaving the cookie absent, because
  that is the stronger statement to the ad scripts that read only the cookie.
  Nothing is stored for the API at all. That is not an inconsistency: one says
  no and the other says nothing, and neither says yes.
- **A vendor's own fallback path is the specification for a stub.** Funding
  Choices serves a different script when it has nothing to show, and booting
  that one answers every question worth asking: which globals, which iframe
  names, which command names, and the exact strings its internal queue
  answers with. It also answers the ones that look like bugs: it does NOT run
  a publisher's callbackQueue, so neither does the resource. Running it would
  be inventing a behaviour the CMP does not have on that path, which is the
  same mistake as making one do less than it does.
- **A CMP can be a front end for another CMP, and then the record that counts
  is the inner one's.** Ziff Davis's zdconsent.js injects OneTrust's
  otSDKStub.js and its own decision function reads OneTrust's groups - the
  OptanonConsent cookie, or window.OnetrustActiveGroups - over the top of the
  defaults its own cookie set. So that resource is built out of the OneTrust
  one (`// @include ../onetrust/lib/...`, with the layer handed in rather than
  called alongside) instead of reimplementing it. The trap in composing: the
  outer layer decides, so it has to drive the inner one. An accept that stands
  down - over a GPC header, there - must stand the layer underneath down with
  it, or the record the file writes and the record the CMP's own code reads
  disagree, and the page believes the inner one.
- **Read the variant off the element uBO redirected.** Two files that differ by
  two booleans (zdconsent.js and zdconsent_eu.js: gdprApplies and optinApplies)
  cannot be told apart by a resource that only looks at the page - but the
  script element keeps its original src through a `redirect=`, so
  `document.currentScript.src` says which file was asked for. A scriptlet
  injection has no currentScript, so sweep `script[src*=...]` as well.
- **A page's element ids are named properties of the window.** speedtest.net
  gives their tag `id="zdconsent"`, which makes `window.zdconsent` the script
  ELEMENT until something assigns over it. A stub that adopts "whatever object
  is already there" will hang its API on a DOM node, silently, and the page
  then replaces it. Check `nodeType === undefined` before adopting.
- **Writing nothing is not always a refusal.** Complianz's `cmplz_has_consent`
  returns true for an absent cookie where the tenant's `consenttype` is `optout`
  or `other`, so a refusal has to write `deny` per category explicitly - leaving
  the record empty consents on exactly the sites that assume consent. Check what
  the CMP's own reader does with a missing value before deciding a stub can stay
  quiet. Their record also carries the current policy id, and
  `cmplz_check_cookie_policy_id` denies everything and re-shows the banner when
  it does not match, so a record written without it is wiped on the next page.
- What varies per tenant is left alone deliberately: `publisherCC`, publisher
  restrictions, how many vendors keep legitimate interest, the tenant's consent
  language, whether Google vendors are enabled. None is derivable from a page.
- Categories and cookie fields are a deliberate superset, so a site asking about
  one its tenant never defined still gets an answer.
- **Ask who puts the banner in the page.** The legacy Cookie Law Info plugin
  looks like the easiest family here - two globals, one cookie, nothing parked
  - and a stub that only wrote the cookie would have left a visible, dead
  cookie bar on half its deployments. 3.3.2 and 4.1.10 prepend their markup
  themselves, so replacing the file leaves nothing; 1.5.4 and 1.6.3 have no
  prepend at all, because PHP prints the markup and their script only hides
  it. Grep the file for `prepend`, `appendTo`, `innerHTML` and `body` before
  deciding a no-op is enough, and look at a live page to see whether the
  markup is already there and whether their CSS hides it.
- **When the CMP is open source, run it beside the resource.** CookieConsent
  v3 is MIT-licensed, so its own `cookieconsent.umd.js` could be loaded into
  the same jsdom page as the replacement, given the same config, and compared:
  the record field for field, their `getUserPreferences`, which cookies their
  auto-clear deleted, which parked tags were freed, which callbacks fired in
  which order. That oracle found a divergence no amount of reading would have:
  a visitor who had already answered gets `onChange`, not `onFirstConsent`,
  carrying `changedCategories` and `changedServices` - and the first draft
  fired the first-consent pair every time. Do this before writing the tests,
  and pin what it establishes; do not vendor their bundle into the repo, the
  way the AMP family does not.
- **Two of their behaviours look like bugs in a harness and are not.** Their
  script manager chains on load, so a freed tag with a `src` holds the rest
  until it fires - in a page with no network nothing after it ever runs, with
  their own bundle as much as with this one. A test that put an inline parked
  tag behind a src'd one passed without having looked at it, and a test for
  their inverted `!category` form did the same. Put the tag under test first.
- **A browser signal their own code reads is theirs to honour, and the gate is
  their own switch.** A refusal is already as strong as GPC or DNT can make it,
  which is why most families here say "GPC changes their side, not this one".
  The divergence is in the other variants: tarteaucitron's unblock consents to
  video and social, and their own code, on their own
  `parameters.handleBrowserDNTRequest`, writes `<service>=false` when the
  header is sent - so with that switch on it now consents to nothing. Honour it
  where their config asks for it; where the signal is per-visitor and the
  behaviour is per-group tenant configuration that is not on the page -
  OneTrust's `IsDntEnabled` - say so in the gaps instead of guessing. And note
  that a console line said at boot cannot report any of it: theirs runs init
  afterwards.
- **A constant copied from another family is a constant nobody measured.**
  Adapting an IAB layer from `onetrust/lib/onetrust-tcf.js` carries its
  answers with it, and two of them were wrong for iubenda: the ping's
  `apiVersion`, and whether a refusal keeps vendor legitimate interests. An
  audit of all eleven layers found the same thing in inmobi. Three CMPs answer
  three different strings, each measured in their own bundle:

      OneTrust   "2.0"   their otSDKStub.js, the file that installs the
                         early __tcfapi on their pages
      Civic      "2.2"   their cookieControl-9.x.min.js, which also answers
                         tcfPolicyVersion 4 while its string says 5
      @iabtcf    "2"     iubenda and inmobi both build on @iabtcf/cmpapi,
                         whose CmpApiModel sets apiVersion to "2"

  Everything else in that audit held up, because it had been measured: the
  ten cmp ids all match the IAB's published list, appconsent's 4000 vendor
  ceiling is "their own vendor cap", pubtech's vendor list 178 is "pinned in
  the bundle as the list they fetch", osano's 187 is "their
  fallbackGvlVersion", and the 178/179 split across families is per-CMP rather
  than staleness. The lesson is not "re-measure everything" - it is that an
  adapted file needs its constants walked one by one against the CMP it now
  stands in for.
- **Grep the family, not the file.** That audit first reported four families
  missing the stub drain. Three of them do it in the core
  (`appconsent`, `inmobi`) or through a local alias the pattern missed
  (`consentmanager`, `cookieyes`, `fundingchoices`, `pubtech`), and the
  mutation that was supposed to prove inmobi's new drain survived - because
  the core had drained already, measured, with the same zero-argument call
  their own bundle uses. The addition was reverted. Two families really do
  not drain: `civic`, where theirs does not either, and `osano` and
  `usercentrics`, whose bundles are per-tenant and were not available to say.
- **A configuration the page sets is not there at document_start.** Several of
  these read a global the page prints above the CMP's script tag -
  `_iub.csConfiguration`, `window.cookiezBannerSettings`, `window.complianz`.
  A redirect lands where that tag was, so the global is already there; a
  scriptlet runs before the page has run anything at all, and the same code
  then reads an empty object. Measured on iubenda: a record under `_iub_cs-`
  with no tenant id, in their simple form on a per-purpose tenant, and not one
  of the page's callbacks fired. On Cookiez: a record carrying an empty
  `cookiesHash`, which is the one thing their own gate checks. **Both filter
  lists recommend the scriptlet form for CSP sites, so this was the
  recommended path.** The fix is the same in both: do nothing until the
  configuration exists, then install - at once where it already does, on the
  next tick otherwise, and on every pass of
  `src/shared/lib/deferred.js` until it appears. Check this for any family
  that reads a page-authored global; complianz and tarteaucitron were checked
  and behave the same either way.
- **An absent configuration is not an empty one.** Waiting has to end
  somewhere, and `Object.keys(config).length !== 0` is the line: a settings
  object of theirs that is present but missing a field is a real deployment
  and still gets a record, while nothing at all means not yet.
- **The marker is the once-only guard.** A user with the network rule AND the
  scriptlet gets the resource twice. Cookiez already returned early on its own
  marker; iubenda did not, and injected twice it fired the page's callbacks
  twice and pushed the consent-mode signals twice. Guard on the marker, and
  mutate BOTH guards at once when testing it - a mutation that leaves the
  other one standing survives and looks like a coverage gap.
- **A loader is a better thing to replace than a bundle.** iubenda ships a
  4KB loader that reads the page's configuration and fetches 450KB of core;
  Ziff Davis and consentmanager are the same shape. Replacing the loader means
  the core is never requested, so the rule is one line and the stub does not
  have to live alongside a running CMP. Check what the loader fetches before
  writing a rule for the big file.
- **A CMP's own stub can overwrite the replacement.** iubenda's page loads
  `cs/tcf/stub-v2.js` and `cs/gpp/stub.js` itself, ahead of the loader, and
  each installs a window-level API that queues every call until their core
  arrives. One that loads *after* the replacement overwrites a working
  `__tcfapi` with one that answers nothing, so the list drops them. Their stub
  also hands its queue back differently from OneTrust's - calling `__tcfapi()`
  with no arguments returns the array, rather than parking it on
  `__tcfapi.a` - so a drain copied from one family answers nothing in another.
- **Do not block the auto-blocker.** iubenda's
  `cs.iubenda.com/autoblocking/<siteId>.js` is the file parking the trackers:
  it rewrites a tag's `src` into `data-suppressedsrc` before anything runs.
  Blocking it lets every tracker load unparked, which is the opposite of the
  point. The same reasoning applies to any CMP's blocker.
- **Some of these cannot be blocked at all, and the replacement is the only
  option.** AMP's `amp-consent` is not a CMP that owns the page, it is an
  extension of a host runtime, and that runtime refuses to build any element
  carrying `data-block-on-consent` until the extension registers a service and
  the service answers. Blocking it is worse than doing nothing: the page keeps
  the holes for ever. Before writing a rule for something that is loaded *by*
  another script rather than by the page, read what the loader does when it
  never arrives.
- **Registering with a host runtime means meeting its contract exactly, and
  the contract is in the runtime, not the extension.** For AMP, measured in
  `v0.mjs` and `v0.js`: an entry pushed onto `self.AMP` is dropped by the
  module runtime when `m` is falsy and by the classic runtime when it is
  truthy, so both entries are pushed and each runtime takes its own; and on a
  version mismatch the runtime calls `reloadExtension`, which fetches the real
  file from its `/rtv/` url and the replacement never runs at all. A hardcoded
  version is therefore not a staleness problem, it is a silent bypass - so the
  version is read through a getter, when the runtime reads the entry, from the
  `amp-version` attribute the runtime itself set. Both failures were measured
  by mutating the resource and watching the real runtime re-fetch the real
  file.
- **A console line is worth more where the work happened than where the
  script ran.** The AMP resource says its line from inside the registration
  callback, so the line names the runtime that accepted it and its absence
  means no registration - a version mismatch, or the real extension having got
  there first. Said at the top of the script instead, it reported
  `runtime=unknown` on every page that loads the way a page actually loads.
- **A pass over the document at boot matches nothing.** The replacement runs
  where the CMP's script tag is, which is in `<head>`, and uBO runs it at
  document_start: every tag the page parked for the CMP to free is below that
  point and does not exist yet. A single synchronous `querySelectorAll` is not
  a small bug, it is the whole feature failing silently, and no test built
  around a ready fixture can see it - the fixture has the nodes already. Prove
  it the way a page does, with the resource inline in `<head>` and the parked
  tag in the body, parsed: five of the six resources that free parked tags
  freed nothing. `src/shared/lib/deferred.js` is the pass-again mechanism
  (scan now, on added nodes debounced, at DOMContentLoaded, at load), and only
  the modes that free something install it.
- **A pass that runs again has to be idempotent, and freeing is usually not.**
  Where the resource removes the parked node, a second pass is a no-op. Where
  it leaves the node and inserts a copy - which is what Complianz,
  consentmanager and Termly all do, because that is what theirs do - the copy
  carries the class or the `data-` attribute that the selector matched, so the
  pass answers its own work, and the insertion is itself a mutation: it never
  stops. Read what the CMP's own code uses as its done-marker
  (`data-cmp-ab`, `cmplz-activated`) and honour it; where there is none, keep a
  `WeakSet` here rather than writing a marker onto their page. Pin it with a
  test that counts after settling twice.
- **An attribute in a CMP's markup is not its data model.** WebToffee's
  settings modal disables its necessary checkbox, so reading `disabled` looks
  like the obvious way to tell which category is theirs to keep - but their own
  `disableAllCookies` unticks every box whose slug is not in
  `Cli_Data.strictlyEnabled`, and `disabled` is only how their CSS stops a
  click. The live payload carries `[ 'necessary', 'obligatoire' ]`: a translated
  site names the category in its own language, and the attribute reading would
  have written `yes` for a category their own reject erases. Find the list the
  CMP's own code reads and read that one.

## Testing

`npm test` builds, then runs the suite **against `dist/`**, parsed with uBO's own
line rules and joined the way uBO joins several resource URLs.

- **An object the page built is not deep-equal to one built in the test.**
  `assert.deepEqual` compares constructors too, so an array or object that came
  out of the jsdom realm fails against a literal here with "same structure but
  not reference-equal" - which reads like a real difference and is not. Compare
  a copy made in this realm: spread it, take `Object.keys`, or round-trip it
  through JSON. It has cost time in four families now.
- **Mutation-test anything you add.** Break the code the test covers and watch it
  fail. Three tests here passed for weeks against the wrong thing: they were
  satisfied by the document-ready full scan, not by the observer they claimed to
  test, and deleting the observer left them green. It happened again in
  cookiescript afterwards, so here is the mechanism: **jsdom fires
  `DOMContentLoaded` in the same turn as an insertion**, so a test that injects
  markup while the document is loading and then awaits a microtask is served by
  the ready-event sweep whether the observer runs or not. To test an observer,
  inject into a document that has already loaded (`await settle(50)` before
  `eval`): the ready and load sweeps are then never registered and their delayed
  pass is far off, so nothing but the observer can act.
- **An event-target bug hides behind a `window` listener.** A bubbling event
  dispatched at `document` reaches a `window` listener too, so a test listening
  there passes either way. Listen where a page listens, and assert `ev.target`
  and `ev.bubbles`.
- **Don't write a mutation that leaves a long timer.** `node --test` waits for
  the event loop to drain, so stretching a cleanup timer to ten minutes hangs
  the run rather than failing it - remove the cleanup call instead. (And a
  `pkill -f` pattern matches its own command line; kill by pid.)
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

That holds for a publish by hand as much as for a release. Dispatching
`publish.yml` without bumping first does nothing at all: the version is already
on npm, so the run skips the publish step and says so. Bump, push, then
dispatch.

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
