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
Control**, **Cookiebot**, **Securiti** and **Transcend**.

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
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.17.1/dist/onetrust-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.17.1/dist/onetrust-accept.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.17.1/dist/onetrust-reject-unblock.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.17.1/dist/cookieinformation-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.17.1/dist/inmobi-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.17.1/dist/osano-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.17.1/dist/civic-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.17.1/dist/civic-reject-unblock.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.17.1/dist/cookiebot-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.17.1/dist/securiti-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.17.1/dist/transcend-reject.js
   ```

   Then reload the filter lists (*Filter lists* → *Purge all caches* →
   *Update now*).

   Pinned to a release: the URL never moves, and it changes with each one, which
   is what makes uBO refetch - it will not ask again for a URL it already has.
   Swap the tag for `main` to track every push instead.

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
   [`filters/transcend.txt`](filters/transcend.txt) into *My filters*, or host
   them and subscribe via *Import*.

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
including their tri-state `"Auto"`, which becomes an explicit no. `null` as the
auth is what a site's own consent manager passes when a choice was not made by
clicking - Costco's does exactly that, which is how we know a tenant with auth
off accepts a decision recorded this way.

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

It works in either position. Served in place of the banner it runs with airgap
already ready. Injected as a scriptlet it runs at `document_start`, before
`airgap.js` - the first script on the page - has executed, and installs their
own stub shape, `{ readyQueue, ready }`, which `airgap.js` spreads over its own
definition, so the callback queued there is one it drains.

### Deliberate gaps

- **A tenant that requires a trusted event** gets `Authorization proof is
  untrusted` from its own airgap, and the refusal is written to their `tcm`
  cookie instead, in the shape one of their own cookies carries. The console
  line says which way it went - `via=setConsent` or `via=cookie`.
- **A site with a consent UI of its own** - Costco builds one on airgap rather
  than using `ui.js` - reads the same refusal, so it has nothing to prompt for,
  but it may ask before airgap has got as far as fetching `ui.js`. The scriptlet
  form records the refusal before anything renders; `filters/transcend.txt` has
  the lines.
- **`airgap.js` is deliberately left alone**, and a test asserts the filter list
  never names it. Replacing the engine would drop its blocking and mean
  reimplementing the API it exposes.

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
https://raw.githubusercontent.com/ryanbr/consent-rr/v1.17.1/dist/onetrust-reject.js
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
