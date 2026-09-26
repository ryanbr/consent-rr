# consent-rr

Cookie-consent **r**esource **r**eplacements for uBlock Origin.

A consent manager is normally dealt with by hiding its banner and clicking its
buttons (`trusted-click-element`), which means the banner has to render first,
the selector has to keep matching, and the click has to land. These resources
take the other route: uBO redirects the CMP's own script to a stub that reports
a decision the visitor already made. No banner is ever built, nothing has to be
clicked, and the page's consent API answers normally.

Currently covered: **OneTrust** (and its CookiePro tier).

| Resource | What the page sees |
| --- | --- |
| `onetrust-reject.js` | A stored *reject all*: `C0001` on, everything else off. Tags parked behind a category stay parked. |
| `onetrust-accept.js` | A stored *accept all*: every category on, and tags parked behind one are switched back on. |

Pick `reject` as the default. `accept` is for sites that put the content itself
behind a category (embedded players, maps) rather than behind the banner.

## Install

1. **Resources.** uBlock Origin → *Settings* → *Advanced settings* →
   `userResourcesLocation`. Set it to whichever resource you want, or to both,
   whitespace-separated:

   ```
   https://raw.githubusercontent.com/ryanbr/consent-rr/main/dist/onetrust-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/main/dist/onetrust-accept.js
   ```

   Then reload the filter lists (*Filter lists* → *Purge all caches* →
   *Update now*).

   Each file stands on its own: nothing else has to be loaded for it to work.
   Its first line, `/// onetrust-reject.js`, is the resource header uBO reads -
   and a comment to JavaScript, so the file is a readable script at the same
   time.
2. **Filters.** Paste [`filters/onetrust.txt`](filters/onetrust.txt) into
   *My filters*, or host it and subscribe via *Import*.

Check it took: on a OneTrust site, `OneTrust.consentRR` in the console names the
mode that is active.

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
- The IAB layer the SDK installs when a tenant enables it: `window.__tcfapi`
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

### Deliberate gaps

- **The TC string follows the resource**, and its shape is copied from one a
  real OneTrust reject-all wrote: consents all zero, but vendor *legitimate
  interests* left intact, because refusing does not object to legitimate
  interest - that needs a separate action. Policy version 5, and timestamps
  rounded to midday UTC so the string is stable for a day rather than unique per
  page load. Vendor ids are handled as one range to 1500 instead of a bit each.
- The TC string names no jurisdiction (`publisherCC` is `AA`), because a
  replacement has no geolocation to go on. Consent language is read off the
  page's `lang`.
- **Some sites keep their own record of the choice**, outside OneTrust, and
  re-prompt or gate content until their own key is set. That is a per-site
  filter with `set-local-storage-item`, not something a OneTrust emulation
  should guess at; `filters/onetrust.txt` has a worked example.
- **`consent.onetrust` is never dispatched.** `OnConsentChanged()` registers a
  real listener, but consent never *changes* here — exactly like a return visit
  whose choice is already stored. A site that only initialises from that event
  will behave as it does for a returning visitor.
- **No claimed location.** `getGeolocationData()` answers empty rather than
  inventing a region for a site to branch on.
- **Cookies are host-only.** The real SDK scopes them to the registered domain,
  so a decision is not shared with subdomains here.
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

`src/onetrust-*.js` are thin entry points; the behaviour is in
`src/lib/onetrust-core.js`, pulled in by a `// @include` line, so accept and
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
