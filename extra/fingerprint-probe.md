# extra/fingerprint-probe.js

A diagnostic scriptlet. It reports which fingerprinting surfaces a page
touches, how many times, and which script did it - and it changes no
answer, blocks nothing and sends nothing. NOT for a filter list.

```
www.example.com##+js(fingerprint-probe)
```

A scriptlet and not a redirect, because it has to be in place before the
thing it watches, and the script it watches is often on a randomised
first-party path that no rule can name.

## Why it exists

Asked for a replacement for the two Akamai Bot Manager sensors on
bestbuy.ca:

```
/x-WNe4/.../9bztHdT4           639080 bytes, response sets _abck, bm_sz
/x-WNe4/.../DOXE-dyd2AQ?v=...  476869 bytes, response sets bm_s, bm_so
```

A replacement is the wrong tool for those, and the reasons are
measurements rather than caution. There is no page-facing api to stand in
for: every `bmak` reference is computed indirection through per-build
string tables, there is one `.bmak =` assignment in 639KB, and the newer
build has no readable identifier at all. The gate is server-side - `_abck`
and `bm_s` are issued by their edge in response to a valid sensor post, so
a stub silences the client without minting the cookie and the site then
denies protected routes. And that site is enforcing: a plain `curl` of the
homepage is reset by the edge mid-stream.

What could NOT be answered statically is what the sensor actually
collects. Their strings are built by a runtime decoder: a census of the
639KB file finds `userAgent`, `platform`, `maxTouchPoints` and
`mediaDevices` and nothing else, and decoding the hex-escaped literals
yields only the decoder's own primitives - `apply`, `fromCharCode`,
`charCodeAt`. Four leaked names are enough to say it fingerprints. They
are not enough to say how much, and unwrapping the rest means executing
639KB of untrusted vendor code, which is not something this repo does.

So this answers it from the page instead. Put it on the site, read the
table, and the question stops being a guess.

## What seven sensor urls across three sites show

bestbuy.ca, macys.com and lowes.com, fetched 2026-11-28:

```
sha1          bytes    sites                 response sets
c427bc8744d8  639080   bestbuy only          _abck, bm_sz
2dcaf343dcef  635257   macys only            _abck, bm_sz
fe6a50abb7b4  622807   lowes only            _abck, bm_sz
147340cdc406  476869   ALL THREE, identical  bm_s, bm_so
771ace96284f  104238   lowes only            al_sess
```

Five sites now, and the picture is settled:

```
the ?v= build, three releases across six sites
  147340cdc406  476869   bestbuy, macys, lowes
  463b9099c212  471217   walgreens, kroger
  bc727907ac81  505170   kohls

the _abck sensor, one per site - seven sites, seven hashes
  c427bc8744d8  639080   bestbuy
  2dcaf343dcef  635257   macys
  fe6a50abb7b4  622807   lowes
  084658e27724  621294   walgreens
  1e5e4823dc87  198846   kroger - a third of the others, so either a
                         different tier or a different script
  4e72547e691b  661304   kohls
  d49fa32091c7  636631   cdw

shared components, same bytes on different sites
  771ace96284f  104238   lowes and kohls, identical. No Bot Manager
                         marker in the body, and the cookie it sets is
                         per tenant: al_sess on lowes, vpusq on kohls
  2712 bytes    text/css on the same path family - their CHALLENGE
                         overlay: #sec-overlay, #sec-container,
                         #sec-cpt-if, .funcaptcha, .crypto, .behavioral,
                         .adaptive, .custom-branding
```

So the `?v=` build is a release and not a tenant - three of them across
six sites, with kroger landing exactly on walgreens' hash being what
confirmed the grouping. The first version of this note said identical
across ALL sites, from three samples; a fourth disproved it, a fifth
explained it, and a sixth added a release nobody had seen. Worth
remembering before the next three-sample claim.

The 104KB file was recorded here as lowes-only. It is not: kohls serves
the same bytes, and the cookie name is the part that is per tenant.

And the same randomised path family serves a 2712-byte `text/css` file
that styles their CHALLENGE - the overlay, the captcha iframe, funcaptcha,
the proof-of-work and behavioural variants. A rule shaped to those paths
would take the stylesheet too, so a challenged user gets an unstyled or
invisible challenge instead of a solvable one: the page would look broken
rather than ask a question. One more reason the path shape is the wrong
thing to match on.

Neither Akamai file rotates: fetched twice, the same bytes both times.

The `_abck` sensor is per-tenant, now four sites and four distinct files,
all about the same size. The 104KB lowes file shares the obfuscator of the
others, `(function lZXCvmVlwT(){...}` against `(function
xnrjUkVwcK(){...}`, carries none of the Bot Manager markers, and sets
`al_sess` instead.

The paths give a list nothing to hold on to. Each site has a constant
prefix of four or five segments - `/x-WNe4/zHknCo/RwyTkux/Pne/CO/`,
`/J7Hyp81fA/omtxB/IWqOu/O7V-yIac/`, `/TCrK2/e/6E/uz8v/iYQGwMvg/` - and
then varying ones, with segment lengths from one character to sixteen.
There is no cross-site shape that would not also match ordinary
first-party urls, which is the mechanical reason no list carries a generic
rule for this vendor, on top of the enforcement reason.

The one distinctive marker is the query: `?v=` followed by a uuid, on the
shared build. That is targetable by regex if anyone wants to, and the
shared hash means the decision would be the same everywhere - but it is
still the file whose response mints `bm_s`, so blocking it has the same
consequence as blocking the rest.

## Kasada, the other vendor this probe is for

costco.com serves Kasada rather than Akamai, and it lands in the same
place for the same reasons:

```
/<uuid>/<uuid>/p.js     153311 bytes, the loader. No readable marker at
                        all, and it creates the global by indirection
/<uuid>/<uuid>/ips.js   770556 bytes, the payload, fetched with
                        KP_UIDz=<token>&x-kpsdk-v=j-1.2.1020&x-kpsdk-im=...
                        and opening with KPSDK.scriptStart = KPSDK.now()
```

`KPSDK` is the one page-visible global, and it carries exactly two
readable members - `scriptStart` and `now` - which appear only in that
first line, passing timing between their own two files. There is no api a
page calls, so there is nothing to stand in for.

Kasada rotates its payload, which Akamai does not. The same `p.js` url
fetched three times in a row answered 154147 bytes, then 160387, then
154147 again - it alternates between builds per request. costco.ca serving
different bytes from costco.com is that rotation and not the domain, which
is what the three fetches were for: the first reading of two samples would
have been a per-site difference that does not exist. So a hash identifies
nothing here, and the stable thing is the path - the two uuids are
per-customer and the same on both of Costco's domains.

And the gate is server-side again, in the clear this time: their requests
carry `x-kpsdk-ct` and `x-kpsdk-cd` headers computed by the payload, with
`KP_UIDz` as the cookie. A stub cannot compute those, so the site refuses
the request rather than the page breaking visibly.

Two vendors, two obfuscation schemes, one conclusion: measure with the
probe, do not replace. The probe needs nothing vendor-specific to do that
- it watches the surfaces, not the sensor.

## What it watches

```
navigator   userAgent platform language languages hardwareConcurrency
            deviceMemory maxTouchPoints vendor webdriver plugins
            mimeTypes doNotTrack cookieEnabled appVersion product
            productSub oscpu pdfViewerEnabled
screen      width height availWidth availHeight colorDepth pixelDepth
            and devicePixelRatio
canvas      toDataURL toBlob getContext getImageData measureText
webgl       getParameter getExtension getSupportedExtensions, on both
            WebGLRenderingContext and WebGL2RenderingContext
audio       createOscillator createAnalyser createDynamicsCompressor
device      mediaDevices.enumerateDevices getBattery getGamepads
            permissions.query speechSynthesis.getVoices
locale      Intl.resolvedOptions Date.getTimezoneOffset
webrtc      createDataChannel
behaviour   the registration of listeners for mousemove mousedown
            mouseup click keydown keyup keypress touchstart touchmove
            touchend pointermove pointerdown scroll wheel
            deviceorientation devicemotion focus blur visibilitychange
```

Each entry is counted, and the first caller is recorded from the stack -
that url is what attributes a read to a vendor rather than to the site. It
reports when the document is ready and again five seconds after load,
because a sensor that waits for an idle moment is exactly the thing worth
catching.

## Is it watching everything

Checked against the catalogue rather than from memory: FingerprintJS keeps
one file per signal in `src/sources`, which is 41 of them. Where this
stands against that list:

```
covered   audio canvas color_depth cookies_enabled cpu_class
          date_time_locale device_memory hardware_concurrency languages
          os_cpu pdf_viewer_enabled platform plugins screen_frame
          screen_resolution timezone touch_support vendor webgl
          indexed_db local_storage session_storage open_database
          apple_pay audio_base_latency user_agent_data
          and eight through matchMedia: color_gamut contrast
          forced_colors hdr inverted_colors monochrome reduced_motion
          reduced_transparency
left out  fonts, font_preferences - the technique measures offsetWidth on
          spans, and a page's own layout reads swamp the signal
          math - Math.tan and friends, watchable but indistinguishable
          from ordinary arithmetic
          architecture - a typed-array ordering trick, not an api
          dom_blockers - injects elements to detect an adblocker,
          not an api call
          private_click_measurement, vendor_flavors - property reads on
          window and anchors that a page makes constantly
```

`navigator.userAgentData` and `matchMedia` were the two real gaps when
this file was first written: the first is the highest-entropy call there
is, asking for platform, model and full browser version at once, and the
second covers eight signals by itself. Both are watched now, with the
media feature named in the report rather than the whole query.

## Will it set the anti-bot off

Probably, and that matters for the measurement as much as for the session:
a sensor that spots a wrapper may stop collecting, and then this reports
less than the page really does. Two one-line checks used to give it away
outright, measured in jsdom with and without it:

```
String(Date.prototype.getTimezoneOffset)
  .includes("[native code]")                 true -> false
window.addEventListener
  === EventTarget.prototype.addEventListener true -> false
```

Both pass now. Every wrapper carries the name, length and `toString` of
what it replaced - and `toString` answers `String(real)`, so a native
reports the `[native code]` string and a function something else had
already wrapped reports theirs, which is truer than claiming native. The
listener wrap moved from `window` and `document` onto
`EventTarget.prototype`, so the identity check holds, with a filter
keeping the counts to those two targets.

It is still detectable, and nothing here pretends otherwise:

```
Function.prototype.toString.call(fn)   sees the real source - the masking
                                       is on the function, not on
                                       Function.prototype
descriptor identity                    the getters are not the native ones
timing                                 a wrapped accessor is slower
error stacks                           a sensor reading new Error().stack
                                       inside a getter sees an extra frame
```

Which is the honest position for a diagnostic: quiet enough that a passing
check does not flag it, and no match for a sensor that looks properly. Run
it in a session you do not mind having flagged.

### Where the masking stops, and why

Three more things could be masked and are not:

```
Function.prototype.toString   patching it would cover the wrappers, and
                              the patch is then visible in turn - the
                              start of an arms race, not a diagnostic
navigator.webdriver,          nothing here is automated. Spoofing these
headless markers, cdc_,       makes a browser look like a different
plugin arrays, canvas noise   browser, which is bot-evasion tooling and
                              a different thing from an instrument that
                              does not announce itself
```

The distinction this file holds to: masking its OWN footprint keeps the
measurement honest, because the session really is a person in a real
browser and the wrappers are the only thing that is not. Masking the
BROWSER would be building something else.

### Saying when the measurement may be void

Since the masking cannot be complete, the report answers the question
instead of hiding from it. Their cookies - `_abck`, `bm_sz`, `bm_s`,
`bm_so`, `ak_bmsc`, `KP_UIDz`, `datadome`, `_px3`, `reese84`, `incap_ses`
and the rest - are set by their edge in response to a payload, so:

```
surfaces touched, cookie present   a normal run, read the table
NOTHING touched, cookie present    their sensor ran and touched none of
                                   this: read it as possibly detected,
                                   not as a clean page
nothing touched, no cookie         no sensor here at all
```

Which is a better answer than deeper masking would have been: a
measurement that reports its own validity beats one that quietly fails.

## What it must never do

Change an answer. Every wrapper calls the real one and returns what it
returned, so a page behaves as it would without this - the first test in
the file is that, and a mutation that returns `undefined` from a watched
getter is killed by it. A probe that alters what it measures is measuring
itself, and on a bot-managed site it would also get the user blocked.

### The bug a browser would have found and jsdom did not

These wrappers are defined inside a strict IIFE, so a BARE call -
`matchMedia(q)`, `openDatabase(d)`, `addEventListener(t, fn)`, which is
how pages write them - lands `undefined` as `this` inside the wrapper.
Passing that to a native method is `Illegal invocation` in Chrome. jsdom
does not mind, so every test passed while the probe would have broken
three window methods on a real page.

They call through as `this || host` now, and the tests use stand-ins that
reject an undefined `this` the way a browser does, because the only way to
catch this in jsdom is to make the fixture as strict as the real thing.

Found by reading the code rather than by running it, which is the only way
it could have been found here.

## What it costs a page

```
file on disk      12009 bytes
injected           9114 bytes
globals set       window.__fpLog, the buffer the console line names
listeners         none of its own
observers         none
requests          none
answers changed   none, which is the first test in the file
```

Injected was 10701 until the reasoning moved into the header, which uBO
drops - comments are 11% of what ships now rather than 24%. The code lines
are byte-identical before and after, checked by comparing the non-comment
lines, with the suite and the sweep re-run.

## The mutation sweep

```
node tools/mutate.mjs fingerprint-probe
```

34 mutations, 30 killed, 4 named equivalents in
`tools/mutations/fingerprint-probe.json`.

Two of the four equivalents are about `enumerable`, and they are worth
reading before anyone 'fixes' them: redefining an existing property keeps
the attributes a descriptor leaves out, and converting a data property to
an accessor preserves `enumerable` and `configurable` by itself. Naming
them changes nothing. The names are kept because the code reads as though
they matter.

One test needed rebuilding twice. The post-load pass waits five seconds,
which is longer than the sweep's per-test cap, so waiting for it made the
suite fail unmutated - and the mutation that removes that pass was never
given a fair run. Collapsing the delay did not work either: jsdom fires
load during the constructor, so the pass ran before the test had read its
baseline. The callback is held and fired on demand now, which is both fast
and exact.

## What it is not

It is not a blocker and not a replacement. It will not stop a sensor
collecting, and it will not keep a site working when the sensor is
blocked. If a page reports a surface here that nothing explains, that is
the evidence for a decision - not the decision.
