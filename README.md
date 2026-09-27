# consent-rr

Cookie-consent **r**esource **r**eplacements for uBlock Origin.

A consent manager is normally dealt with by hiding its banner and clicking its
buttons (`trusted-click-element`), which means the banner has to render first,
the selector has to keep matching, and the click has to land. These resources
take the other route: uBO redirects the CMP's own script to a stub that reports
a decision the visitor already made. No banner is ever built, nothing has to be
clicked, and the page's consent API answers normally.

Currently covered: **OneTrust** (and its CookiePro tier) and **Cookie
Information**.

| Resource | What the page sees |
| --- | --- |
| `onetrust-reject.js` | A stored *reject all*: `C0001` on, everything else off. Tags parked behind a category stay parked. |
| `onetrust-accept.js` | A stored *accept all*: every category on, and tags parked behind one are switched back on. |
| `cookieinformation-reject.js` | Cookie Information: the necessary category approved, everything else denied. One resource - no accept or unblock variant. |
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

[COMPARISON.md](COMPARISON.md) sets the three side by side, row by row, measured
from the built files rather than described.

## Install

1. **Resources.** uBlock Origin → *Settings* → *Advanced settings* →
   `userResourcesLocation`. Set it to whichever resource you want, or to both,
   whitespace-separated:

   ```
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.6.0/dist/onetrust-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.6.0/dist/onetrust-accept.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.6.0/dist/onetrust-reject-unblock.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.6.0/dist/cookieinformation-reject.js
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
2. **Filters.** Paste [`filters/onetrust.txt`](filters/onetrust.txt) and
   [`filters/cookieinformation.txt`](filters/cookieinformation.txt) into
   *My filters*, or host them and subscribe via *Import*.

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
- A page with a strict `script-src` CSP that omits `data:` will refuse the
  resource: user resources have no extension URL, so uBO serves them as a
  `data:` URI. Trusted Types enforcement can likewise block tag revival.
- Accept mode revives advertising tags too, which is what accepting means. uBO
  still blocks the requests they make.

## Development

```sh
npm run build   # src/ -> dist/onetrust-accept.js, dist/onetrust-reject.js
npm test        # builds, then runs the suite against the built files
```

The version comes from `package.json` and nowhere else: the build substitutes
`@@VERSION@@` and refuses to ship a file where the placeholder survived, so
bumping there is enough. Releasing is three steps, and the tag is what says
which commit a version shipped from:

```sh
npm version minor --no-git-tag-version   # or patch
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
https://raw.githubusercontent.com/ryanbr/consent-rr/v1.6.0/dist/onetrust-reject.js
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
