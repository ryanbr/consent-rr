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

## What it must never do

Change an answer. Every wrapper calls the real one and returns what it
returned, so a page behaves as it would without this - the first test in
the file is that, and a mutation that returns `undefined` from a watched
getter is killed by it. A probe that alters what it measures is measuring
itself, and on a bot-managed site it would also get the user blocked.

## The mutation sweep

```
node tools/mutate.mjs fingerprint-probe
```

14 mutations, 12 killed, 2 named equivalents in
`tools/mutations/fingerprint-probe.json`.

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
