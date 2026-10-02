# consent-rr

Cookie-consent **r**esource **r**eplacements for uBlock Origin.

A consent manager is normally dealt with by hiding its banner and clicking its
buttons (`trusted-click-element`), which means the banner has to render first,
the selector has to keep matching, and the click has to land. These resources
take the other route: uBO redirects the CMP's own script to a stub that reports
a decision the visitor already made. No banner is ever built, nothing has to be
clicked, and the page's consent API answers normally.

Currently covered: **OneTrust** (and its CookiePro tier), **Cookie Information**,
**InMobi Choice** (formerly Quantcast Choice), **Osano**, **Civic Cookie
Control**, **Cookiebot**, **Securiti**, **Transcend**, **Usercentrics**,
**PubTech**, **Termly**, **Ketch** and **AppConsent**.

| Resource | What the page sees |
| --- | --- |
| `onetrust-reject.js` | A stored *reject all*: `C0001` on, everything else off. Tags parked behind a category stay parked. |
| `onetrust-accept.js` | A stored *accept all*: every category on, and tags parked behind one are switched back on. |
| `cookieinformation-reject.js` | Cookie Information: the necessary category approved, everything else denied. One resource - no accept or unblock variant. |
| `inmobi-reject.js` | InMobi Choice: a stored refusal. Nothing consented to, a TC string that says so, and `__tcfapi`, `__gpp` and `__uspapi` all answering instead of stalling. |
| `civic-reject.js` | Civic Cookie Control: every optional category the site declares recorded as `revoked`, the necessary ones untouched, and `CookieControl` answering. |
| `civic-reject-unblock.js` | Civic, for a site that withholds content until a category is on: accepts the categories that do not read as tracking, refuses the ones that do, and still refuses the IAB layer. |
| `cookiebot-reject.js` | Cookiebot: their own default state, which is already a refusal - `necessary` true, `preferences`, `statistics` and `marketing` false - with `CookieConsent` answering and parked tags left parked. |
| `securiti-reject.js` | Securiti: a refusal recorded in their own `__privaci_cookie_consents`, with the API their loader parks answering instead of queueing for an SDK that never arrives. |
| `transcend-reject.js` | Transcend: no banner, and the refusal recorded through airgap's own API - which leaves airgap itself in place, blocking by that refusal. |
| `appconsent-reject.js` | AppConsent: nothing consented, their `IABTCF_` keys saying so, and `__tcfapi` answering instead of a stub nothing will replace. |
| `appconsent-accept.js` | AppConsent, granting - for a consent-or-pay wall that keeps the page shut until the answer is yes. Every purpose and vendor consented, and a vendor handed that string may act on it. |
| `ketch-reject.js` | Ketch: their 1.9MB SDK never fetched, their command queue answering a refusal, and a returning visitor's record revoked code by code. |
| `ketch-reject-unblock.js` | Ketch, for a site that withholds content until a purpose is consented to: the same stored and sent refusal, while the API tells the page every purpose is on. |
| `termly-reject.js` | Termly: no banner, their own opted-in record - essential alone - with their denied Google consent mode, and the tags their auto-blocker parked left parked. |
| `pubtech-reject.js` | PubTech CMP: no banner, their publisher-cookie string with every choice off, and `__tcfapi` answering a refusal the IAB's own library agrees is one. |
| `usercentrics-reject.js` | Usercentrics: no banner, and no service consented in the record their own blocker reads - which leaves that blocker in place, blocking by it. A service a returning visitor had accepted is revoked by name. |
| `osano-reject.js` | Osano: their own default state, which is already a refusal - `ESSENTIAL` accepted, `STORAGE`, `MARKETING`, `PERSONALIZATION` and `ANALYTICS` denied - stored where they store it, with `Osano.cm`, `__tcfapi`, `__gpp` and `__uspapi` answering. |
| `onetrust-reject-unblock.js` | Stores and sends the same refusal as reject - cookie, TCF and GPP all say no - while telling the page's own scripts every category is on, and letting every parked tag go. |

Pick `reject` as the default. `reject-unblock` is for a site that withholds the
content until you agree: it stores and sends the same refusal as `reject` - the
cookie, the TC string and the GPP string all say no - and separately tells the
page's own scripts that every category is on, because that is a variable on the
page rather than anything transmitted. It also un-parks every gated tag. Sites
gate their players on precisely that read:

```js
window.OptanonActiveGroups.includes('C0004')   // automobiles.honda.com
```

`accept` is for when you actually mean it: it grants consent in the cookie, to
every TCF vendor and in the GPP string as well.

[COMPARISON.md](COMPARISON.md) sets the three side by side, row by row, and then
every resource in the repo against each other - measured by running the built
files, not described.

## Install

1. **Resources.** uBlock Origin → *Settings* → *Advanced settings* →
   `userResourcesLocation`. Set it to whichever resource you want, or to both,
   whitespace-separated:

   ```
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.28.4/dist/onetrust-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.28.4/dist/onetrust-accept.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.28.4/dist/onetrust-reject-unblock.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.28.4/dist/cookieinformation-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.28.4/dist/inmobi-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.28.4/dist/osano-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.28.4/dist/civic-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.28.4/dist/civic-reject-unblock.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.28.4/dist/cookiebot-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.28.4/dist/securiti-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.28.4/dist/transcend-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.28.4/dist/usercentrics-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.28.4/dist/pubtech-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.28.4/dist/termly-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.28.4/dist/ketch-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.28.4/dist/ketch-reject-unblock.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.28.4/dist/appconsent-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.28.4/dist/appconsent-accept.js
   ```

   Then reload the filter lists (*Filter lists* → *Purge all caches* →
   *Update now*).

   Pinned to a release: the URL never moves, and it changes with each one, which
   is what makes uBO refetch - it will not ask again for a URL it already has.
   Swap the tag for `main` to track every push instead.

   Every release is on npm as well, so the same files come off a CDN if you
   would rather not fetch from GitHub - same bytes, same pinning:

   ```
   https://cdn.jsdelivr.net/npm/consent-rr@1.28.4/dist/onetrust-reject.js
   https://unpkg.com/consent-rr@1.28.4/dist/onetrust-reject.js
   ```

   The package is `dist/` and `filters/` and nothing else; `npm i consent-rr`
   is for hosting the files yourself rather than for importing anything.

   Each file stands on its own: nothing else has to be loaded for it to work.
   Its first line, `/// onetrust-reject.js`, is the resource header uBO reads -
   and a comment to JavaScript, so the file is a readable script at the same
   time.
2. **Filters.** Paste [`filters/onetrust.txt`](filters/onetrust.txt),
   [`filters/cookieinformation.txt`](filters/cookieinformation.txt),
   [`filters/inmobi.txt`](filters/inmobi.txt),
   [`filters/osano.txt`](filters/osano.txt) and
   [`filters/civic.txt`](filters/civic.txt) and
   [`filters/cookiebot.txt`](filters/cookiebot.txt) and
   [`filters/securiti.txt`](filters/securiti.txt) and
   [`filters/transcend.txt`](filters/transcend.txt) and
   [`filters/usercentrics.txt`](filters/usercentrics.txt) and
   [`filters/pubtech.txt`](filters/pubtech.txt) and
   [`filters/termly.txt`](filters/termly.txt) and
   [`filters/ketch.txt`](filters/ketch.txt) and
   [`filters/appconsent.txt`](filters/appconsent.txt) into *My filters*, or
   host them and subscribe via *Import*.

Redirecting the SDK's own request is the usual way in, but where a tag manager
loads OneTrust there is no request to redirect - uBO's lists neuter
`googletagmanager.com/gtm.js`, so the container never runs and `otSDKStub.js` is
never asked for. The same resources inject as scriptlets, which also puts them
at `document_start`:

```
example.com##+js(onetrust-reject)
```

Written without `.js`: uBO appends that itself when resolving a scriptlet token,
so `+js(onetrust-reject.js)` looks for `onetrust-reject.js.js`, finds nothing and
injects nothing at all. Only `$redirect=` takes the full resource name.

Check it took: each resource announces itself on load, so the console on a
OneTrust site shows a line like

```
[consent-rr] onetrust-reject 1.6.0 groups=,C0001, tcf=refused gpp=refused
```

and `OneTrust.consentRR` reports the same mode and version.

uBlock Origin (the MV2 extension) only — uBO Lite cannot load user resources.

## What the stub actually does

The surface was read off OneTrust's own `otSDKStub.js` and `otBannerSdk.js`, so
page code cannot tell it apart from a return visit. No OneTrust code is
reproduced.

- `window.OnetrustActiveGroups` and `window.OptanonActiveGroups`, both as
  `,C0001,C0002,` — the SDK's exact format.
- `window.OneTrust` and `window.Optanon`, one object, assigned *over* anything
  the page preset there (a site can set `geolocationResponse` before load, and
  the real SDK keeps it).
- `OptanonConsent` and `OptanonAlertBoxClosed` cookies, with the fields the SDK
  writes, including `interactionCount=1` and `intType` (`1` is its
  "Banner - Allow All", `2` its "Banner - Reject All"). An existing `consentId`
  is reused so a site does not see a brand new visitor on every page load.
- `dataLayer` seeded or pushed with the SDK's own `OneTrustLoaded` /
  `OptanonLoaded` events, plus the `OneTrustGroupsUpdated` entry the banner half
  adds once consent is announced, so GTM triggers still fire.
- `InsertScript()` and `InsertHtml()` gated per category the way
  `canInsertForGroup()` is, so a strictly-necessary insert still goes in while
  everything else is refused, and `options.ignoreGroupCheck` still overrides.
- `window.OptanonWrapper()` called once, and kept looked-for a few seconds
  because pages often declare it after the SDK tag.
- `OneTrustGroupsUpdated` dispatched on `window` with the granted ids.
- Server-rendered banner markup (`#onetrust-consent-sdk` and friends) removed,
  as it arrives.
- The IAB **GPP** layer, the US counterpart, which `otSDKStub.js` installs
  itself: `window.__gpp` (`ping`, `addEventListener`, `removeEventListener`,
  `hasSection`, `getSection`, `getField`, plus the `queue` and `events`
  accessors), the `__gppLocator` frame and the `__gppCall` bridge. The section
  is `usnat`: refusing asserts the sale, sharing and targeted-advertising
  opt-outs, accepting declines them, and the Global Privacy Control bit carries
  the browser's own signal either way, since that is a fact about the request
  rather than part of the decision. `getGPPData` is refused, as it is not a
  command in GPP 1.1 and the reference implementation refuses it too.
- The IAB **TCF** layer the SDK installs when a tenant enables it: `window.__tcfapi`
  (`ping`, `getTCData`, `getInAppTCData`, `addEventListener`,
  `removeEventListener`), the `__tcfapiLocator` frame and the `postMessage`
  bridge framed vendors use, calls a page stub parked on `__tcfapi.a` answered,
  and the TC string stored in `eupubconsent-v2`.
- Both halves of the SDK's `substitutePlainTextScriptTags()`: a
  `script[type="text/plain"]` gated on a category is replaced by a live copy of
  itself, and a tag carrying `data-src` gets its `src` back. As in
  `reactivateTag()`, only the tag's own categories decide, never the mode - so a
  tag gated on nothing but `C0001` is revived by reject too, while one naming
  `C0004` as well stays parked. Categories are read from `optanon-category-*`
  and `ot-vscat-*` class names, including ids the site invented, and a
  `MutationObserver` keeps handling tags added later.
- Tags a site parked itself rather than letting `OtAutoBlock.js` do it: the
  categories in a `data-optanon-category` attribute, the source in `data-src` or
  base64 in `data-obfuscated-src`, which is moved across and decoded the way such
  a loader does it. Every category a tag names still has to be consented, as
  `canInsertForGroup()` requires - a site's own loader may only ask whether *any*
  of them is, but being that loose would load an advertising tag off the back of a
  consented necessary one.

### Deliberate gaps

- **The TC string follows the resource**, and its shape is copied from one a
  real OneTrust reject-all wrote: consents all zero, but vendor *legitimate
  interests* left intact, because refusing does not object to legitimate
  interest - that needs a separate action. Policy version 5, and timestamps
  rounded to midday UTC so the string is stable for a day rather than unique per
  page load. Vendor ids are handled as one range to 1500 instead of a bit each.
- **What varies per tenant is left alone rather than guessed.** Four sites
  sampled disagreed on the publisher country (DE, DE, US), on whether a refusal
  keeps legitimate interest at the purpose level (two of three did not), on how
  many vendors keep it (15, 22, 390) and on publisher restrictions (none, none,
  ten). So `publisherCC` is `AA`, the user-assigned code rather than a country;
  a refusal keeps legitimate interest for vendors but not for purposes, the
  majority shape; and no publisher restrictions are written.
  `vendorListVersion` is `178`, which every sample carried. Consent
  language is read off the page's `lang`. The string carries the publisher
  segment beside the core, as a real one does, and vendor ids run to 2000 - a
  real string reached 1650.
- Google's Additional Consent string is written as `2~~dv`, in the
  `OTAdditionalConsentString` cookie and as `addtlConsent` in the TCF answer:
  version, then an empty consented list, then an empty disclosed one. A real
  refusal consents to no AC vendor either - its long tail is a disclosure record,
  not consent. A real acceptance moves some 600 ids into the consented slot,
  which is Google's own global list rather than anything a replacement can
  derive, so neither resource claims them.
- **The IAB layer goes in whether or not the tenant had one.** Plenty of
  OneTrust tenants run with the IAB module off and write no `eupubconsent-v2` at
  all, and a replacement cannot tell which, since that lives in domain data it
  never fetches. So those pages get a CMP where they had none, and anything
  probing `window.__tcfapi` - Google's ad stack, mostly - starts taking TCF into
  account. On reject that is the conservative direction, non-personalised or
  limited ads; on accept it grants. It goes in unconditionally because the
  alternative fails worse: a site that gates its player on `__tcfapi` never
  starts without one, with no banner left to click.
- Category sets are tenant-specific - one site defines `C0001` to `C0004` plus an
  IAB stack group, another only `C0001`, `C0002` and `C0004` - so the cookie
  carries `C0001` to `C0005` plus whatever the page's own class names mention.
  Deliberately a superset: a site asking about a category its tenant never
  defined still gets an answer rather than nothing.
- Sites commonly keep their own record of the choice beside OneTrust's and
  re-prompt until it is set, so both resources set `localStorage`
  `cookieChoiceMade` to `true` - the `cookiechoices.js` convention, which
  OneTrust itself never touches. The key records that a choice was made, not
  which way it went. A site using some other key needs a per-site
  `set-local-storage-item` rule; `filters/onetrust.txt` shows the form.
- **`consent.onetrust` is never dispatched.** `OnConsentChanged()` registers a
  real listener, but consent never *changes* here — exactly like a return visit
  whose choice is already stored. A site that only initialises from that event
  will behave as it does for a returning visitor.
- **No claimed location.** `getGeolocationData()` answers empty rather than
  inventing a region for a site to branch on.
- Cookies are scoped to the registered domain, as the SDK scopes its own -
  found by probing, since a page has no public suffix list and a cookie set on
  one is refused. A host-only copy would not replace the SDK's, it would shadow
  it: two `OptanonConsent` cookies, and a site taking the first match reads
  whichever is older. Seen happening on a live site.
- **A page whose CSP omits `data:` for scripts silently refuses a redirected
  resource.** User resources have no extension URL, so uBO serves them as a
  `data:` URI, and `script-src-elem`/`script-src`/`default-src` without `data:`
  blocks it. Nothing of ours runs: no console line, no cookie, no marker - and
  because the real SDK was replaced at the network layer, the banner is gone too,
  which makes it look like the resource worked. Seen on almbrand.dk, whose CSP
  allows `'self'` and named hosts only.

  The scriptlet form is not fetched, so it is not subject to that directive:

  ```
  ||policy.app.cookieinformation.com/uc.js$script,redirect=cookieinformation-reject.js,domain=example.com
  example.com##+js(cookieinformation-reject)
  ```

  The redirect keeps the real SDK out; the scriptlet supplies the stub. The tell
  is a CSP violation in the console naming a `data:` script, and
  `CookieInformation.consentRR` or `OneTrust.consentRR` being undefined.
- Trusted Types enforcement can likewise block tag revival.
- Accept mode revives advertising tags too, which is what accepting means. uBO
  still blocks the requests they make.

## InMobi Choice

Two files make up this CMP, and **the replacement goes on the second one**:

```
||cmp.inmobi.com/tcfv2/cmp2.js$script,redirect=inmobi-reject.js
```

`choice.js` is a per-site loader. It inserts `cmp2.js`, injects the banner's CSS,
and calls `__tcfapi('init', 2, fn, config)` with the tenant's entire
configuration inline. `cmp2.js` reads that config back out of the page's IAB
stub - `window.__tcfapi()` with no arguments returns the stub's queue, and the
argument list whose first entry is `init` carries it. So leaving `choice.js` alone
is what gets the tenant's own publisher country, consent language and
legitimate-interest purposes into the answer; replacing `choice.js` instead works
too, on defaults.

The stub then installs what `cmp2.js` installs: `window.__tcfapi` (the built-in
commands plus the custom ones the page itself calls, `init`, `getConfig` and the
`displayConsentUi` behind a privacy-settings button), `window.__gpp` with a
`tcfeuv2` section, `window.__uspapi`, `window.__tcfapiui`, both locator frames and
both `postMessage` bridges, and a `gtag` shim on `dataLayer` where the page has
none. Anything the page parked before the redirect landed is replayed. The TC
string goes into `euconsent-v2` and the GPP string into `IABGPP_HDR_GppString`,
with the attributes and the 390-day life `cmp2.js` uses - scoped to the hostname,
as its own writer scopes it, rather than to the registered domain.

Its refusal was measured against a real one on the same tenant, and differs in
three places, all documented in the source: a real refusal keeps legitimate
interest for 212 *named* vendors where this keeps it as one range (which 212 is a
fact about the vendor list, not about the page); it carries five publisher
restrictions and a disclosed-vendors segment listing 1015 vendors, neither of
which can be derived. Global Privacy Control withdraws legitimate interest
altogether, as it does for OneTrust. `addtl_consent` is deliberately not written:
with nothing consented to, `cmp2.js` deletes that cookie rather than writing one.
`__uspapi` answers `1---`, no notice and no opt-out applicable, because where in
the world the visitor is is not something a page can tell.

## Osano

The whole CMP is one per-tenant file, so there is one thing to replace:

```
||cmp.osano.com/*/osano.js$script,redirect=osano-reject.js
```

`window.Osano` is a function of their own making - `osano.js` installs
`Osano = Osano || function(){ Osano.data.push(arguments) }` so a page can call it
before the script lands, then drains that queue and replaces its `push` so later
calls are handled live. This does the same, with their own mapping:
`Osano("onConsentSaved", fn)` becomes the `osano-cm-consent-saved` listener, and
any other first argument sets a property on `Osano.cm`.

`Osano.cm` answers as it would on a return visit: `getConsent()`, the
`analytics` / `marketing` / `personalization` / `optOut` flags, `locale`,
`userData`, the event methods, and the show/hide methods as no-ops, because
nothing was rendered to show. The record goes into `osano_consentmanager` and
`osano_consentmanager_uuid` - in localStorage *and* a cookie, as theirs does,
scoped to the registered domain for a year - and `osano_consentmanager_expdate`
is cleared, which is what their own save does. An id and timestamp already
stored are kept, so a site does not see a decision made afresh on every load.
Google consent mode gets their signal map, with `ad_storage`, `ad_user_data`,
`ad_personalization`, `analytics_storage` and `personalization_storage` denied
and the two `ESSENTIAL` ones granted.

### The IAB layers

How much Osano installs depends on the tenant, and the tail of its bundle says
which: `C({usp: ...})` for a tenant with the IAB module off, or
`C({gpp: ..., tcf: ..., usp: ...})` for one with it on. All three go in here,
because that switch lives in configuration a page cannot be asked, and a vendor
stalled on an API that never answers is the worse failure.

`__tcfapi` carries their own values - cmpId 279, cmpVersion 3332, policy version
5, GVL fallback 187 - and their own default IAB state: no purpose consents,
legitimate interest for purposes 2, 7, 8, 9, 10 and 11, and **no vendors at
all**, which is where this differs from the OneTrust and InMobi resources, both
of which grant vendors a range. Their command set is `setGdprApplies`, `ping`,
`getTCData`, `addEventListener` and `removeEventListener` - no `getInAppTCData`,
no `getVendorList` - and that is the set answered. The string carries the core
segment alone, as their field sequence does, with timestamps at UTC midnight.

`__gpp` reports the two sections it can build, `tcfeuv2` (2) and `uspv1` (6),
under the `DBACNYA` header; their Canadian section is left out rather than
invented. Their own passthrough works too: `__gpp("uspv1.getUSPData", fn)` is
routed to that section's API. `__uspapi` answers `1---`, or `1-Y-` where the
browser sends Global Privacy Control - which is also the one input their code
turns into a CCPA opt-out by itself, so `OPT_OUT` follows it, and here it
withdraws legitimate interest as well.

### Deliberate gaps

- **Nothing is un-blocked, because nothing was blocked.** Osano holds tags back
  by patching the DOM at runtime - `createElement`, `setAttribute`, the `src`
  setters, `document.cookie` - rather than by parking them in the markup the way
  OneTrust and Cookie Information do. With the CMP replaced, a tag it would have
  held back simply runs, and uBlock Origin blocks what it makes of it at the
  network layer. Re-implementing that interception would mean shipping a second
  content blocker inside a consent stub.
- **The record is plain JSON where theirs is encrypted.** Their own reader tries
  `JSON.parse` first and only then decrypts, so what this writes is what
  `osano.js` itself would read back if it ever loaded - it would honour the
  refusal rather than re-prompt. The cookie copy is percent-encoded, unlike
  theirs: an unencoded quote or comma in a `Cookie` header is what a strict
  server-side parser refuses, taking the rest of the header with it. localStorage,
  which their reader consults first, carries it verbatim.
- **Two departures inside the IAB layer.** Their publisher country falls back to
  `US` where the location lookup has not answered; this writes `AA`, the
  user-assigned code, because `US` names a country a page cannot know. And
  Global Privacy Control withdraws legitimate interest here, as it does in the
  other resources - their own default keeps it either way, but that signal is
  the objection a plain refusal is not.
- **Tenant data is left empty rather than invented**: `jurisdiction` and
  `countryCode` come from a location lookup, `revision`, `cmpContentHash` and
  `publishTimestamp` from the tenant's own configuration. `gdprApplies` answers
  `true`, the protective answer where it cannot be known.
## Civic Cookie Control

```
||cc.cdn.civiccomputing.com/9/cookieControl-9*.js$script,redirect=civic-reject.js
```

The page drives this one. It loads the script and then calls
`CookieControl.load({...})` with its whole configuration inline - the categories,
their `onAccept` and `onRevoke` callbacks, the cookie settings, and whether the
IAB module is on - so everything the stub answers with is the site's own, and
none of it has to be guessed at.

`CookieControl` is in place before that call and carries their method set:
`load`, `update`, `config`, `info`, `getCategoryConsent`, `changeCategory`,
`toggleCategory`, `open`, `hide`, `notify`, `acceptAll`, `rejectAll`, the
`getCookie` / `getAllCookies` / `saveCookie` / `delete` helpers, `geoInfo` and
`geoTest`. The decision goes into their `CookieControl` cookie as URL-encoded
JSON - `necessaryCookies`, `optionalCookies` keyed by their own
`_validCookieName` (the name with separators stripped, so `marketing (social)`
becomes `marketingsocial`), `statement`, `consentDate`, `consentExpiry`,
`interactedWith` and `user` - scoped to the registered domain, `SameSite=Lax`,
for the site's `consentCookieExpiry` or 90 days. An existing record's `user` and
`consentDate` are kept, so a site does not see a decision made afresh each load.

`interactedWith: true` is what does the work: their `finaliseSetup` only builds a
notification when it is false.

One difference from what their own script writes, and it is deliberate: a real
refusal leaves `optionalCookies` **empty**, where this names every category as
`revoked`. Their code accepts anything that is *not* revoked - a `ccpa`-mode site
does that to every category on load, and a `gdpr`-mode one to any category whose
`lawfulBasis` is legitimate interest - so an empty map hands those straight back.
Everything else matches field for field, down to the uuid shape.

The record goes in as **plain JSON, not percent-encoded** - their `saveConsent`
passes `configuration.encodeCookie` as the encode flag and it is false by
default. That is not a detail: sites read this cookie back with their own
helpers, and those do not decode. Goldsmiths runs `JSON.parse` straight over the
raw value and asks whether a category is accepted, so an encoded record throws
there and the site concludes nothing was consented to - which is exactly what an
earlier version of this resource caused. Where a site sets `encodeCookie`,
theirs encodes and so does this. (Osano's cookie is the other way round: theirs
is encrypted, so the plain JSON written there is percent-encoded to keep a
`Cookie` header well formed. The rule is the CMP's own format, not a preference.)

### The IAB layer

Unlike the other consent managers here, this one needs no guessing: the IAB
module is a paid option and the page declares it as `iabCMP: true`. With it off
their script installs no `__tcfapi` at all, and neither does this. With it on,
`__tcfapi` goes in with cmpId 259 and cmpVersion 9, their `update` / `ping` /
`getTCData` / `addEventListener` / `removeEventListener` set, the
`__tcfapiLocator` frame and the `postMessage` bridge - and the TC string goes
where theirs goes, into `iabConsent` inside the same cookie, which their reader
takes verbatim when no compressed `addtlConsent` sits beside it. The separate
`CookieControlTC` cookie follows `setCookieControlTC`, as theirs does.

A refusal here turns **legitimate interest off as well**, which is where this
differs from the OneTrust and InMobi resources: their `_defaultStore` has every
purpose consent and legitimate interest false, and their reject-all leaves them
that way.

### Sites that withhold content

Refusing is the point, but a site may gate its videos, maps or embeds on one of
its own categories and show a placeholder until that category's `onAccept` has
run. Goldsmiths does exactly that, from the configuration on its own page:

```js
{ name: "embedded", label: "Embedded content", …
  onAccept: function() {
      dataLayer.push({ civic_cookies_embedded: "consent_given", … });
      document.dispatchEvent(new Event("embeddedConsentGiven"));   // the page listens for this
  } }
```

The category is the site's own, so no resource can know its name. Name it in
the filter instead, alongside the redirect:

```
gold.ac.uk##+js(civic-reject, embedded)
```

That category is then recorded as `accepted`, its `onAccept` runs, and anything
parked for it with `data-cc-category` gets its `data-src` back - their own accept
path, for that one category. Everything else stays refused. Up to three names,
and `*` for all of them; the console line prints the names a site uses.

Both lines are needed: the scriptlet supplies the stub with its argument at
`document_start`, and the redirect keeps the real script from replacing it.

Arguments only reach the scriptlet form - a `$redirect=` takes none. Where one
line is wanted instead, `civic-reject-unblock.js` decides for itself:

```
||cc.cdn.civiccomputing.com/9/cookieControl-9*.js$script,redirect=civic-reject-unblock.js:10,domain=example.com
```

The `:10` raises its priority above the plain `civic-reject.js` rule, which
matches the same request.

It accepts the categories whose name and label do not read as tracking, and
refuses the ones that do - `analyt`, `statistic`, `performance`, `advertis`,
`marketing`, `targeting`, `tracking`, `remarket`, `personali[sz]`. On
Goldsmiths that is `embedded` accepted, `analytics` and `advertising` refused,
so the videos play while the two `gtag("consent", "update", …)` calls their
other categories make are never run.

**This is the one thing in the repo that is guessed at rather than read off
somebody's code**, so the console line prints both lists:

```
[consent-rr] civic-reject-unblock 1.4.0 mode=gdpr revoked=analytics,advertising accepted=embedded iab=off cookie=written
```

Plenty of sites park their embeds under a category called `marketing`, where
that guess refuses the thing you wanted. Name it instead - an argument overrules
the guess, in either direction. Either way the IAB layer still refuses:
unblocking a site's own content is no reason to consent for a vendor list.

### Deliberate gaps

- **Nothing is freed and nothing is deleted.** A tag parked for a category
  carries `data-cc-category` and `data-src`, and their script frees it by copying
  `data-src` into `src` when that category is accepted. None is, so parked tags
  stay parked. Their `deleteAll` - which removes every cookie outside the
  consented set on each load - answers `false` here: that is the blocking half
  of this CMP, uBlock Origin is doing it, and deleting a visitor's cookies is not
  a consent stub's to do.
- **The category callbacks are not called.** Their own load calls `onAccept`
  only for accepted categories, and `onRevoke` only when somebody changes one.
  Nothing is accepted and nobody changed anything, so neither fires. `onLoad`
  does, a second later, as theirs does.
- **The decision cannot be changed from the page.** `changeCategory`,
  `toggleCategory`, `acceptAll` and `rejectAll` answer without doing anything -
  theirs re-render a panel that was never built. A site whose own preferences
  page is built on those calls will find them inert, so a category that has to
  be on is named in the filter instead.
- **`tcfPolicyVersion` is answered as 4 while the string carries 5.** That is
  their inconsistency - their API hardcodes 4, their encoder takes 5 from the
  vendor list they fetch - kept rather than tidied up, so a vendor branching on
  either gets what their script would have given it.
- **No API key check, and no claimed location.** Theirs will not start without
  validating the key against `apikeys.civiccomputing.com`, which also returns
  the visitor's country. `geo` is `null` and `geoInfo()` answers `false`.
- **Version 9 only.** Version 8 is a different, much smaller build and the
  filter deliberately does not match it.

## Cookiebot

```
||consent.cookiebot.com/uc.js$script,redirect=cookiebot-reject.js
||consent.cookiebot.eu/uc.js$script,redirect=cookiebot-reject.js
```

`uc.js` is the engine - it defines the API, blocks the tags, writes the cookie
and fires the events. `cc.js` beside it is the dialog and the site's own
configuration, and is never asked for once `uc.js` is replaced.

`window.CookieConsent` and `window.Cookiebot` are one object, as theirs are, and
it carries their default state, which is already a refusal: `necessary` true,
`preferences`, `statistics` and `marketing` false, `consented` false, `declined`
true, and **`hasResponse` true**, which is what stops their banner being built.
The site's configuration is read off their own script tag - `data-cbid`,
`data-framework`, `data-user-country` - so `Cookiebot.serial` answers with the
site's id rather than an empty string.

The cookie is written the way theirs is, with the quotes and commas already
percent-escaped inside the value, which their own reader unescapes:

```
CookieConsent={stamp:%270%27%2Cnecessary:true%2Cpreferences:false%2Cstatistics:false%2Cmarketing:false%2Cmethod:%27explicit%27%2Cver:1%2Cutc:…}
```

Run through their own parser that yields `declined`. A `stamp` already issued is
kept; where there is none their placeholder `0` stands in, because the real one
is a hash their server issues and nothing here can compute it. The region is
named only where the site's tag says which it is.

Their events fire in their order - `CookiebotOnLoad`, then the declined half,
then `CookiebotOnTagsExecuted`, then `CookiebotOnConsentReady` a tick later -
each with its `CookieConsent…` twin and its `CookiebotCallback_…` global. The
consent-mode signals are theirs too, values and all: Google's seven keys with
`security_storage` granted and the rest denied, their developer id,
`ads_data_redaction`, Microsoft's `uetq` and Clarity.

### Deliberate gaps

- **A tag marked `necessary` runs; everything else stays parked.** Their own
  check tests a tag's categories against `preferences`, `statistics` and
  `marketing` only, so a tag naming none of those is freed - by this as by them.
  `script[type="text/plain"][data-cookieconsent]` and the `data-src` /
  `data-cookieblock-src` forms on `iframe`, `img`, `embed`, `video`, `audio`,
  `picture` and `source` are all handled, `ignore` is left alone, and the
  `cookieconsent-optin-…` classes go on either way.
- **No IAB TCF layer.** Where a site sets `data-framework` to one of the IAB
  values, `uc.js` installs the IAB stub and then loads a separate module that
  implements `__tcfapi`. That module is in neither file, so its identity cannot
  be read off anything and a TC string is not something to invent. Such a site
  is named on the console line - `iab=IAB` rather than `iab=off` - so it is
  visible rather than silent. Tell me if you hit one and it can be built from
  that site's own module.
- **The decision cannot be changed from the page.** `show`, `renew`, `withdraw`
  and `submitCustomConsent` answer without doing anything: theirs re-render a
  dialog that was never built.

## Securiti

```
||cdn-prod.securiti.ai/consent/cookie-consent-sdk-loader.js$script,redirect=securiti-reject.js
```

The loader is a bootstrapper: it asks `app.securiti.ai` where the visitor is,
decides whether TCF applies, and then fetches the SDK - 600 kB of it - with its
stylesheet, its utils and the site's configuration. Replacing the loader means
none of that is requested.

It parks five functions for the SDK to drain - `initCmp`,
`setConsentBannerParams`, `showConsentPreferencesPopup`, `overrideThemeMatching`
and `registerSrtiCookieSDKEvents` - and those answer here rather than queueing
for something that never arrives. `window.SecuritiSDK` carries their
`registerEvent` and `onReady`, and the events that describe a decision already
made - `onLoad`, `onReady`, `onConsentGiven` - are answered on registration,
because theirs fire them once the SDK is ready and this is ready as soon as it
exists. Their Google consent mode goes out denied, in their own key order, the
way gtag pushes it.

**The categories are the part no page can supply.** They live in the tenant's
configuration, fetched from their CDN by id, so a refusal cannot name them - and
does not have to. Every reader in their SDK asks whether a category's id is set
in the record's `consents` map, so a record whose map is empty refuses all of
them, whatever they turn out to be called:

```json
{"consents":{},"st":{},"gcm":{"…":"…","security_storage":"granted"},"ts":1790666096}
```

That goes in `__privaci_cookie_consents` with `__privaci_cookie_consent_uuid`
beside it, and `__privaci_cookie_no_action` - the marker that says nobody has
answered - is cleared. A visitor id and timestamp already stored are kept.

### Their auto-blocking script

A site may load a second, per-tenant file beside the loader:

```
cdn-app3.securiti.ai/consent/auto_blocking/<tenant>/<domain>.js
```

**Leave it alone.** It blocks tags by the site's own classification - moving
`src` to `data-src` and the type to `text/plain` - and releases a category when
the SDK calls `setConsentedCategories`. With the loader replaced that call never
comes, and its own rule is

```js
function O(e) {                                 // allow this resource?
    var t = n.concat(c.non_optout_categories);  // consented ids + Essential
    return t.length && e && e.length && t.some(t => -1 < e.indexOf(t));
}
```

so it reads the refusal this writes, releases nothing, and still lets essential
scripts run. That is the refusal enforced a second time by the site's own list,
at no cost - blocking or nooping that file makes things worse, not better.

One caveat: it reads the consent cookie when it loads, which can be before the
loader runs. A visitor who had previously accepted gets one more page load on
the old cookie before this takes over.

### Deliberate gaps

- **The category names are never known**, so anything a site drives off them -
  `onCategoryConsented`, a preference centre built from them - sees an empty
  map rather than a list of refusals. Nothing is granted either way.
- **No location is claimed.** `__isTcfEnabledForLocation` is `false` and
  `getUserLocationAndLanguage()` answers `null`; theirs come back from the
  lookup this never makes.
- **No IAB layer.** Where a tenant's location has TCF on, their loader also
  fetches `sdk-stub.js` and the SDK implements `__tcfapi`. None of that is put
  back, for the same reason as Cookiebot: the identity is not in any file
  served here, and a TC string is not something to invent.

## Transcend

```
||transcend-cdn.com/cm*/*/ui.js$script,redirect=transcend-reject.js
||transcend-cdn.com/cm*/*/uiV2.js$script,redirect=transcend-reject.js
||assets.mayoclinic.org/content/dam/cpm-transcend/ui.js$script,redirect=transcend-reject.js
```

**Replace the banner, not the engine.** Transcend ships in two halves, and the
page loads the engine first: `airgap.js` is the init script, and it carries the
tenant's whole configuration - the purposes, the cookie-to-purpose table, the
allowed hosts - and blocks requests and cookies itself, by consent. `ui.js` is
the banner, 390 kB of Preact, which airgap fetches only when it decides to
prompt.

So this stands in for `ui.js`: nothing is rendered, and the refusal is recorded
through airgap's own API, which leaves the engine in place as the thing
enforcing it.

```js
airgap.ready(ag => {
    const purposes = ag.getConsent().purposes;   // the tenant's own names
    …                                            // every one of them false
    ag.setConsent(null, refused, { confirmed: true, prompted: true, timestamp });
});
```

The purpose names never have to be known: `getConsent()` hands them over,
including their tri-state `"Auto"`, which becomes an explicit no. Eight tenants
sampled - Costco, Airtable, Mayo Clinic and five others - have between four and
seven purposes, and barely any two sets are the same; Airtable's include
`Marketing`, `Sales` and `EnrichmentConsent`, and others add `Video` or
`GcmAdvanced`. The resource was run against all eight and refuses every purpose
of each.

**How the decision is authorised** is their `requireAuth` option, and not one
of the eight sets it. So the auth is their own load branch:

```js
Bp = e => isTrusted(e) && e.type === "load" && e.timeStamp <= <init time>
```

a trusted `load` event, which every page fires - their path for a decision
nobody clicked. That is waited for rather than guessed at, and the refusal
lands on the current page. Where a tenant does set `requireAuth: "off"`, `null`
is proof enough and no waiting is needed; asking `loadOptions` first keeps their
own *Authorization proof is untrusted* out of the console everywhere else.

Because airgap only fetches `ui.js` when it wants to prompt, the timing works
out: a visitor with nothing recorded gets the prompt, which is this, which
records the refusal; a visitor who already has it recorded never triggers the
fetch, and there is nothing to do.

Two names and two paths, because their builds differ. An older one points at
one UI for the whole tenant, `ui: "/cm/<id>/ui.js"`; a newer one names it per
regime and under a different prefix - Airtable's is
`[{"url":"uiV2.js","kind":"ui"}]` served from `/cm-test/`. The engine and the
API are the same in both, so the resource is too; only the filename and the
path move, and a test checks the rules against a real url of each kind.

**And the bundle need not be on their CDN at all.** airgap takes the UI from
`loadOptions.ui`, so a tenant can point that anywhere: Mayo Clinic's airgap
config names the usual `/cm/<id>/ui.js`, yet the page overrides it and serves
the banner from `assets.mayoclinic.org`, which no `transcend-cdn.com` rule can
reach. That one is named above. For any other site that does the same, the
scriptlet form needs no url:

```
example.com##+js(transcend-reject)
```

It works in either position. Served in place of the banner it runs with airgap
already ready. Injected as a scriptlet it runs at `document_start`, before
`airgap.js` - the first script on the page - has executed, and installs their
own stub shape, `{ readyQueue, ready }`, which `airgap.js` spreads over its own
definition, so the callback queued there is one it drains.

### Deliberate gaps

- **Injected after the page has loaded**, that trusted event has been and gone,
  and the refusal goes to their `tcm` cookie instead - read on the next page
  rather than this one. The console line says which way it went:
  `via=setConsent`, `via=load` or `via=cookie`. That record is the one their own
  banner writes: a genuine cookie from Indiegogo, one of the eight, taken with
  none of this in play, carries the same fields with the same values for a full
  refusal - in the same key order, because both build it from that tenant's own
  purpose list - bar `updated`, which says the decision replaced an earlier one,
  is `false` for a first record, and which airgap coerces and reports rather
  than enforces. A test holds ours against it.
- **A site with a consent UI of its own** - Costco builds one on airgap rather
  than using `ui.js` - reads the same refusal, so it has nothing to prompt for,
  but it may ask before airgap has got as far as fetching `ui.js`. The scriptlet
  form records the refusal before anything renders; `filters/transcend.txt` has
  the lines.
- **`airgap.js` is deliberately left alone**, and a test asserts the filter list
  never names it. Replacing the engine would drop its blocking and mean
  reimplementing the API it exposes.

## Usercentrics

```
||cmp.usercentrics.eu/ui/loader.js$script,redirect=usercentrics-reject.js
||app.usercentrics.eu/browser-ui/*/loader.js$script,redirect=usercentrics-reject.js
```

**Replace the CMP, not the blocker.** Usercentrics also ships in two halves,
and they come from different hosts: `loader.js` off
`web.<region>.cmp.usercentrics.eu` is the CMP, which reads its configuration
off its own script tag and fetches the SDK, a legislation-specific controller
and the banner - around 450 kB across four files. `uc-block.bundle.js` off
`privacy-proxy.usercentrics.eu` is the blocker, and it carries a list of some
111 providers with the patterns that match their scripts, iframes, images and
embeds.

What makes this work is where the blocker gets its answer. Not from the CMP -
out of storage:

```js
getCMPv3Settings() {                       // uc-block.bundle.js
    const i = JSON.parse(localStorage.getItem('ucData'));
    return i?.consent?.services ?? {};
}
```

and its own rule is that `disabledProviders` is every provider **not** in its
whitelist, where the whitelist holds the ids that have consent. So a service it
was never told about stays blocked, and a refusal does not have to name the
tenant's services to be complete. Their own deny-all record agrees: the
`ucString` a denied visitor carries decompresses to `"status":"ALL_DENIED"`
with `"serviceIds":[]`.

Booted against the real bundle, that leaves 89 script patterns and 86 iframe
patterns disabled, nothing whitelisted, and the record their blocker reads
written by this instead of by them.

**A returning visitor is the case an empty record cannot carry**, and it is
worth the extra work. The blocker builds its whitelist at construction from
whatever is already in storage, and its `setItem` hook only visits the ids
present in the value written over it - so an empty map says nothing about the
two services that visitor had accepted and they stay consented. The ids are in
that old record, so each one is named with `consent: false`, which is what
their own deny-all writes too. Both shapes are read: `ucData` for a v3 page and
`uc_settings`, their v2 key, because the blocker falls back to its v2 branch
whenever it cannot see a loader tag - which is what a scriptlet injection looks
like. No v2 record is invented where the page has none.

It works in either position. Served in place of `loader.js` it runs after the
blocker, and the write tells it. Injected as a scriptlet it runs first, and the
blocker reads the refusal at construction instead.

**Both generations are covered**, because they keep the record in different
places and both are still deployed. v3 is `web.<region>.cmp.usercentrics.eu`,
`ucData`, and `__ucCmp` with `UC_UI` beside it. v2 is
`app.usercentrics.eu/browser-ui/<version>/` - 3.108.0 and 3.64.0 sampled, and
their contract is the same bar one unused key - `uc_settings`
in the shape its own `mapSettings` builds, and `UC_UI` as the whole API, 31
methods of it, with no `__ucCmp` and no `UC_CMP_API_READY`:

```js
mapSettings(t, n) {                        // index.module.js, v2
    return { controllerId: t.controllerId, id: t.id, language: t.selectedLanguage,
             services: mapServices(n), version: t.version };
}
```

The generation is read off the script the page loads the CMP from, and the
record that generation's blocker reads is the one written - so a v2 page is not
handed a v3 API it would not otherwise have. Where there is no such script,
because this was injected rather than served, both records go in: the blocker
picks its branch off the DOM, and with no tag at all that is the v2 branch.
Booted against the real bundle on a v2 page, that is again nothing whitelisted
and 89 script patterns left disabled.

Their v2 gtag push is the same `window.dataLayer.push(arguments)`, and v2
touches no cookie at all - `document.cookie` appears nowhere in its 464 kB.

**A third flavour is a library rather than a loader.** Their browser-sdk -
`app.usercentrics.eu/browser-sdk/<version>/bundle.js`, 4.53.0 sampled - is UMD
with a global `UC_SDK` and no banner of its own: the site calls it and builds
its own UI. There is nothing to stand in for, so it is not replaced, and no
rule names it. What makes a refusal hold there is that it is recorded the way
their own code records one:

```js
setUserActionPerformed(t) {                // browser-sdk, and v2
    localStorage.setItem('uc_user_interaction', JSON.stringify(t));
    if (t) localStorage.setItem('uc_interaction_type', 'user');
}
fetchUserActionPerformed() { return 'true' === localStorage.getItem('uc_user_interaction'); }
```

so both of those go in beside the record. **Answered, not accepted**: the
record beside them consents to nothing, and the SDK reading it leaves the
visitor alone rather than prompting again. It keeps the same `uc_settings` that
v2 does, so the blocker needs nothing else. The scriptlet form is what to use
on such a site - `example.com##+js(usercentrics-reject)` - since there is no
CMP script to redirect.

Its settings and template fetches are left alone too
(`api.usercentrics.eu/settings/<id>/latest/<lang>.json` and
`aggregator.service.usercentrics.eu/aggregate/<lang>?templates=...`): a
replaced CMP never asks for either, and a running SDK fares worse with them
broken than answered. That aggregate url is also where the service ids come
from, and they are global template ids pinned per tenant -
`HkocEodjb7@52.11.43` is Google Analytics, `H1Vl5NidjWX@40.18.46` their own
CMP.

### The IAB layer

A TCF tenant's `__tcfapi` comes from the SDK a redirect keeps out, so a page
waiting on one would get nothing. It is answered, with a refusal:

```
cmpId=5 cmpVersion=3 policy=5 isServiceSpecific=true
purposeConsents=0 purposeLegitimateInterests=0
vendorConsents=0 vendorLegitimateInterests=0 specialFeatureOptins=0
```

decoded there by `@iabtcf/core` in the tests rather than by this repo's reading
of the spec. Every vector is empty because **that is their own deny-all**:
`denyAllDisclosed()` calls `unsetAllVendorConsents`,
`unsetAllVendorLegitimateInterests`, and then unsets purpose consents and
purpose legitimate interests too. InMobi's refusal keeps legitimate interest
because InMobi's own default does; this one objects because theirs does.

`gdprApplies` is the one field that is not a refusal but a claim about the law,
and it says GDPR applies - a vendor told otherwise may process with no consent
at all. A mutation flipping it survived the first pass of tests, which is why
it has an assertion of its own now.

**The identity is the part a replaced CMP cannot know.** It is per tenant:
`tcf2.cmpId` and `tcf2.cmpVersion` come back from their settings API, and the
two tenants sampled read `318`/`1` and `null`/`null`. So where the visitor
already carries a `uc_tcf` string, the identity is read back out of it - cmpId,
cmpVersion, list version, publisher country, scope - and reused exactly. Where
there is none, their own fallback is used, `cmpId = tcf2.cmpId || 5` and
`cmpVersion = tcf2.cmpVersion || 3`, and the console says `iab=refused/default`
rather than `iab=refused`.

**Whether a tenant is TCF at all cannot be read either** - it comes back as
`framework: "TCF2"` - so the layer goes in on evidence the page carries: a
`uc_tcf` record from a previous visit, the `__tcfapi` stub a TCF publisher puts
there, or a `__tcfapiLocator` frame. A tenant that is not TCF has none of them
and gets nothing added that their own CMP would not have had. Whatever the
page's stub had queued is answered on the way in, rather than left in a queue
nothing will read.

The record goes in their own `uc_tcf`, `{ acString, tcString, timestamp,
vendors }`, with the AC string left empty rather than invented: it lists
Google's additional-consent vendors, a refusal consents to none of them, and
their own resurface check reads an empty one as nothing to compare.

**GPP carries the same refusal**, as `DBABMA~<tc string>` - section 2,
`tcfeuv2`, whose payload is that string. `@iabgpp/cmpapi` decodes what this
builds and the test compares its parse field for field against what callers
are handed, so a drift in either shows up. `supportedAPIs` is theirs verbatim,
`["2:tcfeuv2","5:tcfcav1","6:uspv1"]`, even though only the first is carried,
and the identity is the one the TCF layer resolved, because their own
`CmpApi` is built from the same pair:

```js
this.cmpId = tcf2.cmpId || 5;            // browser-sdk
this.cmpVersion = tcf2.cmpVersion || 3;
this.gppApi = new CmpApi(this.cmpId, this.cmpVersion);
```

GPP is a setting of its own on their side, `gppEnabled`, so it does **not**
follow TCF: it goes in on its own evidence, a `__gpp` stub or a `__gppLocator`
frame, and a page with the TCF stub alone gets the TCF layer only. Where there
is GPP evidence but no TC string there is no section to carry, so their stub is
left exactly as it was rather than replaced by one answering with an empty
string. A queued call on their stub is answered on the way in, and the locator
frame their own API creates is created here too. `getGPPData` is refused,
because it is not a command in GPP 1.1 and the reference implementation refuses
it.

### Deliberate gaps

- **The service names are only known where the visitor had accepted**, since
  that is the only place they appear. A first visit writes an empty map, so a
  site driving a preference centre off `getServicesBaseInfo()` sees an empty
  list rather than a list of refusals. Nothing is granted either way.
- **No `ucString`.** That is their cross-domain record, lz-string-compressed,
  and it is what carries a decision to a sibling domain. It is not written:
  nothing on the page reads it once the CMP is replaced, and the sibling domain
  gets this resource too.
- **No US or Canadian GPP section.** Which one applies needs the jurisdiction
  their location lookup returns, and a replaced CMP never makes it. Section 2
  is carried, and `hasSection("usnat")` answers false rather than guessing.
- **The legacy CMP before v2 is not targeted.** The blocker still has a branch
  for it - `window.usercentrics.getConsents()`, off
  `usercentrics.eu/latest/main.js` - and nothing here answers that. v2 does not
  define `window.usercentrics` either, so this is the generation before it.
- **The legacy CMP before v2 cannot be reached at all.** Their blocker still
  has a branch for it - `window.usercentrics.getConsents()`, off
  `usercentrics.eu/latest/main.js` - but that script is gone: the url answers
  404 with their marketing page. On a site still carrying the tag the blocker
  takes that branch, finds no `window.usercentrics`, and whitelists nothing, so
  everything is blocked without this. What it also does is throw out of its own
  `setItem` hook, which is why writes here are retried once.
- **No cross-domain record.** Their `cross-domain-bridge.html`, an iframe on
  their own origin, is how a decision reaches a sibling domain, and v3's
  lz-string `ucString` is what it carries. Neither is written: nothing on the
  page reads them once the CMP is replaced, and the sibling domain gets this
  resource too.

## PubTech CMP

```
||cmp.pubtech.ai/*/pubtech-cmp-*.js$script,redirect=pubtech-reject.js
```

One file is the whole CMP - the TCF API, the banner, the vendor lists it goes
on to fetch - and the tenant's configuration is inlined at the top of that very
file as `window.__pub_tech_cmp_config`. So replacing it takes the configuration
with it, which decides what a refusal can state.

Five tenants were read - 312, 466, 121, 356 and 188 - across both builds they
ship, the module one and the classic `pubtech-cmp-v2.js`. They differ in
configuration and agree on the identity, so it is hard-coded: **cmpId 352,
cmpVersion 6, vendor list 178, policy version 5**. `@iabtcf/core` decodes the
string in the tests and every vector in it is empty.

What the configuration took with it is recovered from the visitor instead of
guessed:

| | theirs | without it |
| --- | --- | --- |
| `publisherCountryCode` | `IT` on both tenants | read back out of an existing TC string, else `AA` |
| `publisherCookieVersion` | `3`, `3`, `6`, `22`, `3` across the five | read back out of an existing pcstring, else `0`, which is their own fallback |

Their publisher-cookie string is their own codec - the version, a `-`, then one
character each for feature, user-experience and measurement cookies, with `1`
enabled and `0` disabled - so a full refusal is `<version>-000` and
`technicalCookies`, which has no character, stays on as their necessary
category. The TC string goes in `euconsent-v2` and the additional-consent
string in `ac_euconsent-v2`, left empty in both the cookie and localStorage
because it lists the Google vendors a visitor consented to and this one
consented to none.

**The part worth getting right is their consent queue.** A page registers
callbacks by pushing onto `__pub_tech_cmp_on_consent_queue`, and their drainer
calls each one, records the arguments, then **replaces `push`** so a callback
registered later fires at once with those same arguments:

```js
r[e].latestArgs = n;                       // their lt()
r[e].push = async function(cb) { cb(...r[e].latestArgs); Array.prototype.push.call(r[e], cb) };
```

Page code gated on consent is waiting on exactly that, so it is reproduced
rather than left hanging - both that queue and the `__pre` one - along with
their two GTM events.

### Deliberate gaps

- **No GPP.** Their bundle has no `__gpp` at all, so there is none to put back.
- **No publisher restrictions.** Their own string carries more here on a
  tenant with legitimate interest switched off, which is four of the five
  sampled: they unset the legitimate-interest vectors and then restrict
  purposes 2 and up to `REQUIRE_CONSENT`. This writes the empty vectors and
  not the restrictions - a vendor with neither consent nor legitimate interest
  has no basis either way, and a malformed restriction block would cost the
  whole string its parse. A test pins that choice.
- **Their module build is one of two.** `pubtech-cmp-v2-esm.js` is a module and
  `pubtech-cmp-v2.js` is not; tenant 188 serves the latter. A `data:` URI
  module script may be declined by the browser, and a user resource is served
  as one, so on a module tenant the scriptlet form is the reliable shape -
  `filters/pubtech.txt` says so. The classic build has no such question.
- **The asset host is left alone**: the vendor lists and the publisher-cookie
  declarations are fetched by the CMP this replaces, so nothing asks for them,
  and a rule for them would only break a banner on a page where their CMP is
  still running.

## Termly

```
||app.termly.io/resource-blocker/$script,redirect=termly-reject.js
```

One file is their whole CMP - the auto-blocker, the banner, the tenant
configuration and the visitor's geo, around 460 kB served per request, with the
website uuid in the path and the options in the query string (`autoBlock=on`,
and `masterConsentsOrigin` where a group of sites shares one consent). The rule
stops at the path so both forms match.

**The polarity was the thing to get right**, and their own constants read
backwards at first glance:

```js
OPT_IN:  { ...map(defaultValue=false), do_not_sell: false }   // essential only
OPT_OUT: { ...map(defaultValue=true),  do_not_sell: false }   // everything
map = ({defaultValue}) => values.map(c => [ c, c === ESSENTIAL || defaultValue ])
```

`consentAll()` sets **OPT_OUT**, and their `isAllDeclined()` is
`every(c => c === ESSENTIAL || !state[c])` - so `true` is consented, and their
`OPT_IN` is the refusal. That is what goes into
`localStorage.TERMLY_API_CACHE`, which is a namespaced cache,
`{ TERMLY_COOKIE_CONSENT: { createdAt, value } }`, merged rather than replaced
so the entries beside it and any `document_version_id` already recorded
survive. `do_not_sell` is set where theirs leaves it false: a visitor refusing
is refusing that too.

**Their parked tags stay parked, bar the ones they never block.** The
auto-blocker parks `[data-categories]` elements with the real url in `data-src`
or `data-href` and scripts typed `text/plain`; releasing one clones the node,
puts the url back, retypes the script `text/javascript` and replaces the
original. This releases the elements whose categories include `essential` -
their filter is `some()`, so a tag marked `essential,analytics` goes in on that
path too - which is exactly what their own code does where the CMP is off for a
region and the visitor sends GPC.

Google consent mode is derived rather than invented: their keys map to
categories (`ad_*` to advertising, `analytics_storage` to analytics,
`functionality_storage` and `personalization_storage` to performance,
`security_storage` to essential, `social_storage` and `unclassified_storage` to
their own), so this refusal produces their denied map exactly - everything
denied but `security_storage`. It goes out through their gtag, which is
`dataLayer.push(arguments)`, after their developer id and before the
`userPrefUpdate` and `Termly.consentSaveDone` events, and `window
.TERMLY_FORCE_DISABLE_GCM` is honoured.

### Deliberate gaps

- **No TC string.** A TCF tenant's `__tcfapi` comes from this same file, and
  where their CMP is off they leave behind a ping answering `cmpId 412`,
  `cmpVersion 1`, `cmpStatus "error"`, `cmpLoaded false` - preserving whatever
  `gdprApplies` the page's own stub had. That is what goes back, on evidence of
  a stub or a locator frame, rather than a string invented for a framework the
  tenant may not have enabled: a vendor reading an error has no consent to act
  on, which is the answer.
- **Their embed and documents are left alone** - `embed.min.js` and
  `/document/...` render a published policy or cookie list, which is content a
  visitor asked for rather than consent machinery.
- **GPC changes their side, not this one.** They read it: in a region where
  their CMP is disabled, a GPC visitor gets essentials released and denied
  consent-mode defaults, while one without gets everything released. This
  refuses either way.

## Ketch

```
||global.ketchcdn.com/web/v3/config/*/boot.js$script,redirect=ketch-reject.js
||cdn.ketchjs.com/ketchtag/*/ketch-sdk.js$script,redirect=noopjs
```

**Replace the loader and the rest never arrives.** `boot.js` inlines the
property's configuration and a country-to-jurisdiction table, puts their
command queue on the page, and then fetches the SDK - 1.9 MB of it - which goes
on to fetch `config.json`, a geo lookup and the vendor list. Replacing the
loader means none of that is requested, so the second rule above only matters
where a property names the SDK directly.

**Their queue is the contract worth reproducing**, because page code waits on
it:

```js
window.semaphore = window.semaphore || [];              // boot.js
window.ketch = function() { window.semaphore.push(arguments) };
window.semaphore.unshift(["init", config]);
```

Their SDK shifts that `init` entry off, drains whatever the page queued behind
it, then replaces `semaphore.push` with its own router and sets
`semaphore.ketch` and `semaphore.loaded`. All of that happens here too, with
the router answering a refusal - including their argument convention, where
trailing functions are the resolve and reject callbacks, so
`ketch("getConsent", fn)` works. The command names are theirs, read off that
router: `showConsent` and `showPreferences` rather than the longer spellings
their SDK object uses, and no `emit` or `once`, which it does not route. Each
answer is built fresh per call, because a page that mutated the object it was
handed would otherwise be mutating what every later caller reads. `getConsent()` answers the shape their own
`retrieveConsent()` returns when nothing is recorded:

```js
{ purposes: {}, vendors: [], googleVendors: [], vendorConsents: { tcf: {}, google: {} } }
```

**The purpose codes are what a replaced loader cannot know** - they arrive in
the `config.json` the SDK fetches. So the refusal is expressed where it does
not need them: the API answers nothing consented, and Google consent mode goes
out denied with their two data-layer events, `ketchPermitChanged` and
`switchbitPermitChanged`. The public record, `_ketch_consent_v1_` - base64 JSON
of `{ <code>: { status, canonicalPurposes } }`, in localStorage and a cookie -
is rewritten only where the visitor already has one, with every status flipped
to `denied` and their canonical purposes kept, since that record is the only
place those are visible. On a first visit nothing is written, which is their own
behaviour: `setPublicConsent()` returns without writing when the map comes out
empty.

### For a site that withholds content

```
||global.ketchcdn.com/web/v3/config/*/boot.js$script,redirect=ketch-reject-unblock.js:10,domain=realtruck.com
```

`ketch-reject-unblock.js` is **reject's record with accept's page surface**,
the same trade as OneTrust's and Civic's: what is stored and what is sent are
the refusal, field for field, while the API tells the page every purpose is
consented so the content is released. The cost is precisely that - whatever the
site had withheld now runs, and uBlock Origin is what filters its requests.

The site's own gate decides what has to be answered, and theirs reads a single
purpose code:

```js
window.ketch("on", "consent", e => { hasConsent = e?.purposes?.optional || false })
window.ketch("on", "userConsentUpdated", e => { c && !e?.purposes?.optional && location.reload() })
```

Two things follow. The code is the property's own, so the answer cannot be a
list of names prepared in advance - it answers **by key**, and a purpose it has
never heard of reads as consented, while only the codes it actually knows stay
enumerable so stringifying the answer invents nothing. And `userConsentUpdated`
is never emitted: that second listener reloads the page when an update says the
purpose is off, which would be a reload for every page view. A test holds both
modes to firing `consent` once and that event never.

A code that is asked for is remembered, so a site that reads one and then
iterates - or spreads, or stringifies - finds it there rather than an empty
map. Before anything asks, the enumerable codes are only the ones the visitor's
own record carried; nothing is invented.

The names that are not purposes read through to the object underneath rather
than answering true: `then`, because a truthy one makes an awaited answer hang,
`toJSON`, because it would break stringifying, the object's own methods, and
`__proto__`, which would otherwise hand back a boolean where a prototype
belongs. The same test governs `in`, so a caller checking for `Symbol.iterator`
is told no rather than being sent down an iterate path that throws.

### Deliberate gaps

- **No IAB layer.** Their SDK carries `__tcfapi`, `__gpp` and `__uspapi`, each
  switched on by a plugin in the property configuration that a replaced loader
  never sees, and the identity those strings need comes with it. Nothing is put
  back; a page waiting on one gets nothing rather than an invented string.
- **A property that loads the SDK without the loader** gets no stub from the
  redirect, since there is no `boot.js` request to replace. The scriptlet form
  covers it, and `filters/ketch.txt` says so.
- **GPC changes their side, not this one.** They read it strictly -
  `navigator.globalPrivacyControl === true` **and** a `gpcsignal` cookie - and
  then only in a jurisdiction their `gpc` plugin lists, where it maps to a set
  of purposes to deny. This refuses with or without any of that.

## AppConsent

```
||cdn.appconsent.io/tcf2-clear/*/core.bundle.js$script,redirect=appconsent-reject.js
||cdn.appconsent.io/tcf2-clear/*/*.bundle.js$script,redirect=noopjs
```

Their core bundle is the whole CMP - the TCF API with the IAB's own `cmpapi`
embedded, their state, and the loader for the banner chunks it fetches
afterwards. Replacing the core means those chunks are never asked for; the
second rule only matters where something else requests one.

The identity comes from their own TC model builder, which hard-codes it:

```js
n.cmpId = 2;                               // core.bundle.js, twice
n.publisherCountryCode = "FR";
n.lastUpdated = new Date(t.setUTCHours(0, 0, 0, 0));   // midnight UTC
n.setAllVendorsDisclosed();
```

so every string carries `cmpId 2`, policy version 5, and every vendor as
disclosed - up to the **4000** their own vendor cap falls back to. `cmpVersion`
and the publisher country come back with a configuration a replaced bundle
never fetches, so both are read out of a string the visitor already carries
where there is one, and otherwise default to theirs (33, matching the bundle
series, and `FR`).

Beside `__tcfapi` they keep the standard **`IABTCF_` keys** in localStorage -
seventeen of them - each a string of `0` and `1`, one character per id, built
by their `lt(set, length)`. Those are written here the same way, which is what
a vendor or an in-app bridge reads when it does not ask the API.

Their global answers under **their manager's own method names** - `init`,
`startCMP`, `initIAB`, `setConfiguration`, `update`, `updateExtraPurpose`,
`show`, `noShow`, `presentNotice`, `retryShow`, `accept`, `deny`, `fakedeny`,
`setExternalIds`, `getExternalIds`, `getUuid`, `isFloatingNeedUpdate`,
`extraFloatingAllowed` - and the ones that would render, record or re-ask
resolve without doing any of it.

### Granting, for a wall that charges for a refusal

```
||cdn.appconsent.io/tcf2-clear/*/core.bundle.js$script,redirect=appconsent-accept.js:10,domain=example.com
```

`appconsent-accept.js` is the same resource one line apart, and it **grants**:
every purpose, every legitimate interest, both special features, every vendor
to 4000, and the publisher purposes - in the string and in their keys. It is
for a consent-or-pay wall, where refusing is what keeps the page shut.

The trade is real and worth stating plainly: **a vendor handed that string is
entitled to act on it**, exactly as with `onetrust-accept.js`. What makes it
worth having is that uBlock Origin still filters what those vendors request -
the string says yes, the network says no. Use it per site, never globally.

### Deliberate gaps

- **No GPP and no US privacy string.** Neither appears anywhere in their
  bundle, so there is none to put back.
- **Their state is restamped, never invented.** A real
  `localStorage.appconsent`, captured from a site after accepting, reads
  `{ consents: { consentables: [ { id, iab_id, name, vendors_number, status,
  legintStatus, type } ], vendors: [...] } }`, with their own enum - `ALLOWED
  1`, `PENDING 0`, `DISALLOWED -1` - and a validator in the bundle insisting a
  status is one of those three. Its `type` takes four values, and a real
  accepted state carries all of them: `0` purpose, `1` feature, `2` special
  feature, `3` special purpose.

  Where a visitor already has that state, every consentable and vendor in it
  takes the mode's status, and their names, counts and a vendor's declared id
  lists are left as they are.

  `legintStatus` needs more care, because `-1` means two different things
  depending on the record it is in - *not applicable* in an accepted one,
  *refused* in a refused one - so granting from a refusal cannot tell from the
  field alone which entries could carry a legitimate interest. For purposes it
  does not need to: which of them may be taken on legitimate interest is TCF
  policy rather than a tenant's data, and it is `2, 7, 8, 9, 10, 11` - exactly
  where a real accepted record carries a yes. Everything else keeps what it
  had.

  Measured against both of their real records: granting from their accepted one
  reproduces it field for field, and refusing from it reproduces their
  continue-without-accepting record - the one that forwards to the wall -
  field for field. Granting from *that* record matches on every status and
  every purpose, and leaves three non-purpose flags at `-1` that their own
  accept sets: feature 2, special purpose 2 and special feature 2. Their basis
  for granting those is not visible outside that record - TCF gives a feature
  no legitimate interest at all - so this does not invent one. A test pins all
  three facts.

  Where there is no state, the key is untouched: the list comes back with the
  configuration this never fetches. An earlier pass also wrote `hasConsent` and
  `consentedAll` there - neither appears anywhere in their bundle.
- **GPC and DNT are not read**, because they do not read them either: neither
  `globalPrivacyControl` nor `doNotTrack` appears in their bundle.

## Development

```sh
npm run build   # src/ -> dist/onetrust-accept.js, dist/onetrust-reject.js
npm test        # builds, then runs the suite against the built files
```

Each consent manager carries its own version, from `resourceVersions` in
`package.json`, so adding or fixing one never restamps another's resources. The
build substitutes `@@VERSION@@` with that family's version and refuses to ship a
file where the placeholder survived. `version` in `package.json` is the repo's
own, which is what a release and its tag are named after:

```sh
# bump the family's entry in resourceVersions if its resources changed
npm version minor --no-git-tag-version   # the repo's own version
npm run build && npm test                # dist/ carries the new number
git commit -a && git tag -a v1.3.0 -m '1.3.0 - what changed'
git push origin main --follow-tags
gh release create v1.3.0 --verify-tag --title v1.3.0 --notes-file notes.md
```

The install URLs above are pinned, so they move with each release too - the build
refuses to run while they name a different version from `package.json`, which
stops a release shipping instructions for the one before it.

Every version has a [release](https://github.com/ryanbr/consent-rr/releases),
and its tag gives a URL that never moves - useful both for pinning and as its own
cache-buster, since uBO will not refetch a URL it already has:

```
https://raw.githubusercontent.com/ryanbr/consent-rr/v1.28.4/dist/onetrust-reject.js
```

[AGENTS.md](AGENTS.md) is the working guide - the format traps, the filter-token
rules, where the values come from, and why the tests are written the way they are.

One directory per consent manager under `src/`, its shared code in that
directory's `lib/`, and `dist/` stays flat because uBO addresses a resource by
name alone.

`src/onetrust/onetrust-*.js` are thin entry points; the behaviour is in
`src/onetrust/lib/onetrust-core.js`, pulled in by a `// @include` line, so accept and
reject cannot drift apart. The build inlines it, leaving one self-contained file
per resource. `dist/` is committed, because those are the files uBO fetches.

uBO's resources format is line-based and unforgiving, and the bundler enforces
it: a **blank line ends a resource**, a line starting with `// ` or `#` is
**dropped**, and a `/// ` line is the header or a directive — so blank lines and
whole-line comments are stripped from the output, and no code line may begin
with `/// `. Resources must also stay **ASCII**,
because uBO encodes a user resource with `btoa()`. Sources may not use template
literals, since the stripping is line-based.

Tests run the built files in jsdom, parsed with the same rules uBO applies and
joined the way uBO joins several `userResourcesLocation` URLs. The TC string is
not taken on trust: `@iabtcf/core`, the IAB reference implementation, decodes it
and the tests assert which purposes, special features and vendor ranges come
back, in both directions.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
