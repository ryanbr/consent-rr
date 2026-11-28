/// vwo.js
// Resource replacement for VWO (Visual Website Optimizer, Wingify) settings
// served from dev.visualwebsiteoptimizer.com/j.php, which is the campaign
// settings AND the library in one script - 36KB to 157KB across the twelve
// payloads this was read from.
// Not a cookie-consent resource: it lives outside src/ and is not built
// into dist/ by tools/build.mjs. Hand-maintained, ship as-is.
// THE NOTES ARE IN extra/vwo.md - the page-hiding contract, every member
// and where it came from, the census that fixed the shape, and what a page
// keeps and loses.
// The comments below are a line each; the reasoning for them is there.
// Only lines starting with // at column zero are dropped by uBO, so an
// indented comment SHIPS - these were 5616 of 7945 injected bytes before
// they moved up here, which costs nothing.
//
// THE RULES
// Two entry points. j.php is settings and library in one; /tag/<id>.js is
// their newer unified tag, which fetches j.php, the lib, edrv and dcdn
// itself. Both manage the page-hiding, so either one blocked on its own
// hides the page, and both need covering.
//
// The portable form. Works in every browser AND for any request type,
// because the execution comes from the scriptlet and the network from a
// block that names no type:
//   example.com##+js(vwo)
//   ||dev.visualwebsiteoptimizer.com/j.php
//   ||dev.visualwebsiteoptimizer.com/tag/*.js
// Nothing in this file reads document.currentScript or its own src, so it
// behaves identically injected as a scriptlet - which is why the type on
// the blocking rule can be dropped entirely. $xhr, ping, other and
// whatever they move to next are all covered by naming no type at all.
//
// No $important either, deliberately. A plain block composes with an
// allowlist exception, and some sites need one: this applies no variation,
// so a page whose UI only exists inside a VWO variation cannot be fixed
// here - easylist#7880 was exactly that, a Delivery Method column that
// disappeared at a checkout. On a domain with such an exception the block
// loses, their library runs, and this stands aside because load_co is
// already there. With $important the exception would be defeated and the
// site broken again, so add it only where overriding one is the intent.
// The collection paths - /edrv/, /collect/events/, /apm, /*/track-,
// /ping_tpc.php, /dyn, /analysis/, ee.gif - are separate rules and most
// lists already carry them; nothing here needs to repeat them, and once an
// entry point is replaced nothing asks for them anyway.
//
// The redirect form, Firefox only:
//   ||dev.visualwebsiteoptimizer.com/j.php$xhr,script,redirect=vwo.js
//   ||dev.visualwebsiteoptimizer.com/tag/*.js$xhr,script,redirect=vwo.js
// $xhr is there because a site can fetch the settings itself rather than
// let their snippet build a script element - dailymail does, and a rule
// of $script alone does not match that request at all, so the real
// settings arrive and they run in full. A type list on a redirect is
// still the weaker lever: when the request is an XHR the fetcher gets
// this file as TEXT, and whether it runs is then the page's business -
// it does if the page evals or injects what it fetched, which is the
// usual consent-gated pattern, and it does not if the page parses it as
// data. The block in the portable form above needs no such luck.
// On Chromium a redirect naming a USER resource neither injects nor blocks
// - the request is simply allowed, measured - so a list shipping only this
// leaves those users with no stub and no block. Do not pair it with an
// untyped $important block: the block wins and the redirect never serves.
// Use one form or the other, and the portable one if only one.
//
// Which is why the portable form is the recommendation: it reveals the
// page from the scriptlet whatever the request type turns out to be, and
// the untyped block covers types nobody has seen yet.
// Their own answer when an account is stopped, served from both j.php
// and /lib/<id>.js, is 110 bytes and does the first thing this does:
//   /* VWO execution stopped */ try{let code=window._vwo_code||
//   window._wingify_code;code&&code.finish()}catch(e){}
// Which is where the second snippet global comes from: _wingify_code is
// the Wingify-branded install's, their tag reads window._wingify_code ||
// window._vwo_code, and the two are interchangeable.
// Their snippet writes a style that
// hides hide_element, usually the body, and only takes it away when the
// settings answer or a timer expires - so a block is a blank page for
// settings_tolerance, 2000ms on a default install. This takes the hiding
// away at once, through their own exits.
// On Chromium a redirect naming a USER resource does not inject and does
// not block: the request is simply allowed. There it has to be a scriptlet
// beside a blocking rule - ##+js(vwo) with the rule above as $script,
// important. Measured, see extra/adobe-launch.md.
//
// WHY AN ARRAY AND NOT AN OBJECT
// Their snippet makes window.VWO = window.VWO || [], and their library,
// vanj.js, is written to find that:
//   init:            i || (i = window.VWO = window.VWO || []);
//                    process(c, e, i); addPushListener(c, e, i)
//   process:         for ( e.sort(fn); d < e.length; ) processEvent(e[d])
//   addPushListener: var d = e.push; e.push = function(a) {
//                      d.apply(e, ...);
//                      e[e.length-1] === a && processEvent(a) }
// A plain object breaks that twice in the case this file exists to survive
// - the scriptlet ran, nothing was blocked, their library loads after.
// e.sort is not a function, and their push wrapper captures an absorbing
// push so e[e.length-1] is never what was pushed and every page call is
// dropped. Both were measured before and after the fix.
// push wraps the array's own: it appends with it, so their listener's
// capture-and-wrap still works - var d = e.push; e.push = ... - and then
// settles what was queued, which is the one thing absorbing it would not
// do. A page waiting on a callback it pushed is a page that never renders.
//
// WHAT IT PUBLISHES, and why each member is there
//   get           asked for "visitor.id" and nothing else, 15 times.
//                 Empty string: what their guarded caller expects, and
//                 what stops window.VWO && window.VWO.get(...) throwing
//   init          called unguarded from a OneTrustGroupsUpdated listener
//   event         they install it themselves when it is absent
//   consentMode   read as consentMode.cReady, after their own || {}
//   ssMeta        their literal, { enabled: 0, noSS: 0 }
//   collect       their pixel sender - s.gif, e.gif, c.gif, h.gif, l.gif,
//                 ee.gif - so a no-op
//   load_co       injects a script element, so a no-op
//   nonce visUuid data appliedCampaigns   state a page can read
//   _.sE          safeExecute, a regular function to keep the caller's
//                 this; _.domains and _.sD beside it
// Left out because every call site of theirs guards them: initVWOLib,
// consentState, WorkerRef, siteWideCode, caE, sTs, dNR, featureInfo.
//
// THE FLAGS IT MUST NEVER SET
// window._VWO.sCL is the library's double-init guard: a payload that finds
// it set logs dupCode and returns without applying anything.
// window.Wingify.tagLoaded is the tag's: it early-returns on
// window.Wingify && window.Wingify.tagLoaded. The tag sets
// window.VWO.tagLoaded too, but reads only the Wingify one.
// Either one set here would stand their code down and leave a stub that
// cannot answer in its place, so nothing here writes _VWO, Wingify or
// tagLoaded. The same mistake shipped in extra/adobe-launch.js as
// window.__satelliteLoaded and took a field report to find.
// Not publishing Wingify at all is what keeps the tag's guard passing;
// their own call sites self-default it, as window.Wingify || [].
//
// A blank line ends the resource, so none may appear below.
(function() {
    'use strict';
    const w = window;
    const doc = document;
    const existing = w.VWO;
    // load_co, not Array.isArray: theirs stays an array once it is up.
    if (
        existing !== null && existing !== undefined &&
        typeof existing.load_co === 'function'
    ) {
        return;
    }
    const noopfn = ( ) => { };
    // Their array shape, adopting a queue the snippet already filled.
    const api = Array.isArray(existing) ? existing : [];
    Object.assign(api, {
        collect: noopfn,
        // Never anything but a no-op: it injects a script element.
        load_co: noopfn,
        get: ( ) => '',
        init: noopfn,
        event: noopfn,
        consentMode: {},
        ssMeta: { enabled: 0, noSS: 0 },
        nonce: '',
        visUuid: '',
        data: {},
        appliedCampaigns: [],
        _: {
            sE: fn => function() {
                try {
                    return fn.apply(this, arguments);
                } catch ( ex ) {
                }
            },
            domains: {},
            sD: noopfn,
        },
    });
    w.VWO = api;
    // Settling what a page queued, rather than only absorbing it: a page
    // that pushed a callback and waits for it is the blank-page shape
    // extra/adobe-launch.md keeps being about. Their own processEvent is
    // what would have called it.
    let ready = false;
    let settled = 0;
    const drain = ( ) => {
        // Not before the document arrives, and never when theirs is up:
        // _vwo_s is their settings function and only exists once their
        // library ran, and it processes the queue itself - settling here
        // as well would call a page's callback twice.
        if ( ready === false || w._vwo_s !== undefined ) { return; }
        while ( settled < api.length ) {
            const entry = api[settled];
            settled += 1;
            if ( Array.isArray(entry) === false ) { continue; }
            for ( const part of entry ) {
                if ( typeof part !== 'function' ) { continue; }
                // No arguments: theirs would hand over campaign data, and
                // there is none to hand over. A callback that needs it
                // throws into this catch, which is still better than one
                // that is never called at all.
                try { part(); } catch ( ex ) { }
            }
        }
    };
    const queue = api.push;
    api.push = function(...args) {
        const count = queue.apply(this, args);
        drain();
        return count;
    };
    // Either snippet global: theirs are interchangeable, and their own
    // minimal stub reads _vwo_code || _wingify_code.
    // Once only: their finish guards itself, their overlay does not.
    let toldThem = false;
    const theirExits = ( ) => {
        if ( toldThem ) { return; }
        const code = w._vwo_code || w._wingify_code;
        if ( code === null || typeof code !== 'object' ) { return; }
        toldThem = true;
        if ( typeof code.removeLoaderAndOverlay === 'function' ) {
            try { code.removeLoaderAndOverlay(); } catch ( ex ) { }
        }
        if ( typeof code.finish === 'function' ) {
            try { code.finish(); } catch ( ex ) { }
        }
    };
    const release = ( ) => {
        theirExits();
        // All of them: a page can carry two, and getElementById finds
        // only the first - theirs indexes h[h.length>1?1:0] for that.
        try {
            const hides = doc.querySelectorAll('#_vis_opt_path_hides');
            for ( const el of hides ) {
                if ( el.parentNode === null ) { continue; }
                el.parentNode.removeChild(el);
            }
        } catch ( ex ) {
        }
        // Only saves a stray wake-up; theirs would call finish anyway.
        try { w.clearTimeout(w._vwo_settings_timer); } catch ( ex ) { }
    };
    release();
    if ( doc.readyState !== 'loading' ) { ready = true; drain(); }
    // At document_start their snippet has not run, so none of the above
    // exists yet: the pass runs again as the document arrives.
    if ( doc.readyState === 'loading' ) {
        let watch = null;
        // Head and its own children only: a subtree watch on the
        // document builds a record for every node a page parses.
        try {
            watch = new w.MutationObserver(release);
            watch.observe(doc.head || doc.documentElement || doc, {
                childList: true,
            });
        } catch ( ex ) {
            watch = null;
        }
        doc.addEventListener('DOMContentLoaded', ( ) => {
            release();
            ready = true;
            drain();
            if ( watch !== null ) { watch.disconnect(); watch = null; }
        }, { once: true });
    }
})();
