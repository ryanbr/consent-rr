# extra/optimizely.js, the notes

What the Optimizely Web Experimentation replacement does, what it keeps
working for a page, what it refuses, and what it costs. The resource is
hand-maintained and ships as it is, so the notes live here rather than in
its header.

Unlike the other two in this directory, this one was not written against a
corpus of their builds. What is below is read off the resource and
measured, and it says so where a claim has no evidence behind it yet.

## Contents

- [What this is, and the rule](#what-this-is-and-the-rule)
- [What a page keeps, and what it loses](#what-a-page-keeps-and-what-it-loses)
- [What it publishes, measured](#what-it-publishes-measured)
- [What it costs per page](#what-it-costs-per-page)
- [Notes on the members](#notes-on-the-members)
- [What is not done here](#what-is-not-done-here)

## What this is, and the rule

Resource replacement for the Optimizely Web Experimentation snippet, served
from `cdn.optimizely.com/js/<projectId>.js`:

```
||cdn.optimizely.com/js/*.js$script,redirect=optimizely.js
```

The same client is also served for Performance Edge, at a different shape
that the resource reads as well:

```
/public/<account>/<project>/<revision>_<hash>_edge_helper.js
```

A redirect leaves the script element carrying the url it was going to
fetch, which is the only place the project's identity survives - the
snippet url gives the project id alone, and the edge url is the only shape
that also carries the account and the revision.

It is not a cookie-consent resource: it lives outside `src/` and `tools/build.mjs` does not build it into `dist/`.

## What a page keeps, and what it loses

Its own header puts it best, and that text is preserved here: the page
keeps a working `window.optimizely` - push, get, initialized and the
lifecycle listeners, plus the flat Classic api for the projects whose
snippet predates the migration - so code that queues commands or waits on
the client proceeds.

What it loses is everything the real client does with them: no experiment
or campaign data, no variation DOM rewriting, no redirect experiments, no
visitor profile, no `optimizelyEndUserId` or session cookies, no localStorage, and no beacons to `logx.optimizely.com`, `rum.optimizely.com` or `prediction.cmab.optimizely.com`.

## What it publishes, measured

Booted against `cdn.optimizely.com/js/123456.js`, the object carries about sixty top-level members. The modern ones are `push`, `get`, `initialized`, `state`, `data`, `revision` and `timeout`; the rest are the Classic flat api, from `activate` and `bucketUser` through `trackEvent`, `variationMap`, `optOut`, `optOutThirdPartyCookies` and the Site Catalyst
and Universal Analytics hooks.

`get('state')` answers with their state surface - `getActivationId`, `getActiveExperimentIds`, `getCampaignStates`, `getDecisionObject`, `getDecisionString`, `getExperimentStates`, `getPageStates`, `getRedirectInfo`, `getTrafficExclusionStats` and the rest - and `initialized` reads true, so a page that waits on the client does not wait
forever.

It declines to publish anything if a real client is already there: an
existing `window.optimizely` that is not an array and answers `get` is left
alone.

## What it costs per page

```
file on disk      32486 bytes
injected          31495 bytes
compile           0.178 ms (median of 200)
boot              1.12 ms
timers            0
listeners         1 at boot, DOMContentLoaded once, for the lifecycle
cookie reads      0
cookie writes     0
storage calls     0
```

Two more listeners exist but are conditional: `popstate` and `hashchange`
go on only when something subscribes to a url change.

## Notes on the members

These sit beside the code in the resource rather than in its header, which
is the opposite arrangement to tealium and perimeterx. Each is reproduced
here with the declaration it belongs to, so the resource can be read
without them if it ever needs slimming.

### `identityFromScript`

```
const identityFromScript = ( ) => {
```

The request was redirected, not the element, so the script still carries the
url it was going to fetch - the only place the identity of the project
survives. Two shapes: `/js/<project>.js`, which is the snippet and holds the
project id alone, and
`/public/<account>/<project>/<revision>_<hash>_edge_helper.js`, which is the
same client served for Performance Edge and is the only shape that carries
the account and the revision as well.

### `releaseObserver`

```
const releaseObserver = ( ) => {
```

Nothing left to watch means the records the engine builds for every
childList change under the root are built for no one, so the observer goes
rather than idling for the life of the page. The next register makes a new
one.

### `drop`

```
const drop = entry => {
```

False means the entry is spent and should go. A callback can register
another observer, which scans itself and may remove entries, so the index a
loop is holding cannot be trusted afterwards - removal is by identity, and
registering scans the new entry alone rather than all of them, which keeps a
nested call from rescanning the document.

### `pollGroups`

```
const pollGroups = new Map();
```

Their poll keeps one interval per distinct period with a map of callbacks on
it, so ten waiters at the default period are ten calls a tick on one timer
rather than ten timers. Keyed by token, not by the function, so the same
callback can wait twice and cancel once.

### `if`

```
if ( condition() ) {
```

No guard on condition: theirs calls it straight away, so a value that is not
callable throws inside the executor and the promise rejects. Guarding here
would leave it pending for ever instead.

### the poll group condition

```
let historyPatch = null;
```

The wrappers installed for the current subscriptions; `active` is cleared on
the last unsubscription, so a wrapper which stays wrapped by another script
only calls the method and does not notify again.

### `pushState`

```
const pushState = w.history.pushState;
```

Captured for these wrappers only: the shared variables are set again by the
next subscription, possibly to a wrapper of another script which calls these
wrappers.

### restoring history.pushState

```
if ( w.history.pushState === ourPushState ) {
```

Put the natives back only while ours are still the ones installed. Another
script may have wrapped history after us, and restoring over that would
unhook it - theirs checks the same identity before restoring.

### `persistHtml`

```
const persistHtml = (html, selector, placement) => {
```

Theirs re-inserts the markup if the page removes it, which is what the
persist means. This inserts once: the re-insertion exists for variation
code, and no variation runs here.

### `LOG_LEVELS`

```
const LOG_LEVELS = { OFF: 0, ERROR: 1, WARN: 2, INFO: 3, DEB
```

Their logger buffers every line and prints nothing until a level is set -
shouldLog is false while logLevel is null, which is how it starts - so a
normal page sees a silent console. These lines appear the same way theirs
do: push({type:'log', level:'WARN'}), or the legacy push(['log']), which
means INFO. Levels, wording and the complaint about an unknown level are all
theirs.

### `visitor`

```
const visitor = {
```

get('visitor') is assembled from their profile providers, one per key, each
declaring what it provides. Fourteen appear in every snippet read; the eight
marked below are bundled only when a project's audiences ask for them, and
they are here anyway so a page reading one does not meet undefined. dcpData
is the Dynamic Customer Profile key, registered with the
dynamic_customer_profile audience matcher; theirs fetches it, so it is an
empty object here for the same reason location is an object. Nothing about
the visitor is measured: strings are empty, maps are empty, and location is
an object rather than absent, because a property chain into it is exactly
what their own geo.js walks. campaign is singular and holds their
utm_campaign value; campaigns, with an s, is a key of data and not of this.
first_session is true because theirs is true when the event history is
empty, and this one always is. lineItems and dimensions were mine and are
declared by no snippet: dimensions is project data, not a visitor key.

### `visitor.currentTimestamp`

```
Object.defineProperty(visitor, 'currentTimestamp', {
```

Theirs marks this one lazy, so a read takes the time of the read.

### `RECENCY_FILTERS`

```
const RECENCY_FILTERS = [ 'most_recent', 'least_recent' ];
```

get('behavior') is registered as a plugin by every snippet seen, so it has
to answer. Their three methods read the visitor event store, which here
holds nothing, and the argument checks below are theirs: a page that passes
a bad descriptor should still hear about it.

### return spec.reduce ? undefined : [

```
return spec.reduce ? undefined : [];
```

Theirs executes the spec then takes the first element when a reduce is asked
for. Executed against no events that is an empty list, so a reduced query
has nothing to hand back.

### an unknown module

```
if ( name === 'jquery' ) { return w.$; }
```

Theirs does not bundle jQuery, it borrows the page's: env/jquery reads a
closure-scoped $ if there is one and otherwise window.$, and it never looks
at window.jQuery. So a page that called noConflict - jQuery present, $ gone
- gets undefined from theirs, and gets undefined here. A fallback to jQuery
would be answering something they do not.

### the jquery module

```
if ( name === 'event_emitter' ) { return eventEmitter; }
```

Declared below, and only ever reached once the api is installed.

### the event_emitter module

```
const register = spec => {
```

Their emitter puts a token on the spec it was handed when it has none, and
hands the same token back, which is the only way a page learns the one it
must pass to removeListener.

### `eventEmitter`

```
const eventEmitter = {
```

get('event_emitter') is in their module registry beside state and data. on
takes the spec and returns its token, off takes the bare token.

### `commandsV0`

```
const commandsV0 = {
```

Their push picks a table by version: the array and string forms are version
0, an object carries its own or defaults to 1, and the third table in their
client is empty, so a version 2 call finds nothing. A name in the wrong
table is refused there as well, which is why this is two lists and not one -
push('activate') is a version 0 call for a version 1 name, and their answer
to it is false.

### `HIGH_PRIORITY`

```
const HIGH_PRIORITY = [
```

Their push takes a second argument, used once while the client boots:
window.optimizely = window.optimizely.filter(c => !push(c, true)) runs the
six names below out of the queue early, before the opt-out and disable
checks, and leaves everything else in the array for the normal drain. With
the flag set, any other name is ignored and reports false, and that happens
before the table is consulted, so an unknown name is refused quietly rather
than warned about.

### `classicData`

```
const classicData = {
```

Optimizely Classic, the product before this one, is still served for
projects last saved before the migration, from the same `/js/<id>.js` path. It
puts its whole api straight on the object instead of behind push and get,
and their own bundled mode ships both at once, so the two surfaces sit
together here the way they do there. Every method is a no-op; the maps are
the empty ones a project with no running experiment has. referrer stays
empty for the reason it is empty in get('visitor'): theirs reads
document.referrer and this does not.

### classic[name] = hasOwn(commandsV0,

```
classic[name] = hasOwn(commandsV0, name) ? commandsV0[name] 
```

Eleven of these are also v0 push names, and in Classic the method and the
pushed command are the same function, so a page gets the same behaviour
whichever way it asks. log is the one that is not a no-op, and it was the
one diverging: push(['log']) turned the console on while optimizely.log()
did nothing.

### the Classic flat api

```
try {
```

Their $ is the jQuery they bundled, read at the time it is asked for rather
than captured, the same as get('jquery').
## What is not done here

Three things are true of this file and not of the other two, and they are
worth stating rather than discovering:

**Its comments ship.** 104 of its comment lines are indented into the body,
and uBO strips a comment only at column zero, so 7555 bytes of the 31495
that reach a user are prose - just under a quarter of the resource. tealium
and perimeterx had the same problem and had it taken out; this one has not.
Moving those blocks to this document, leaving a line each, is the obvious
next change, and the notes above are already the half of that work that
cannot be done mechanically.

**It carries a backtick.** One indented comment quotes `active` in
backticks, which the repo's own rules ban in a resource. The linter does
not check for it, because `extra/` is not built and the rule is a build
convention, so it has shipped.

**It has no mutation sweep.** 52 tests pass against it, but unlike the
other two there is no harness that deletes a line and checks the suite
notices. Until there is, the tests are unproven rather than proven.
