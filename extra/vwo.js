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
// THE RULE
//   ||dev.visualwebsiteoptimizer.com/j.php$script,redirect=vwo.js
// Blocking this alone hides the page. Their snippet writes a style that
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
// So push is NOT a member here: Array.prototype.push is what their
// listener captures, and with nothing draining the queue a page pushing to
// it is absorbed anyway.
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
// THE FLAG IT MUST NEVER SET
// window._VWO.sCL is their double-init guard: a payload that finds it set
// logs dupCode and returns without applying anything, so the library would
// stand down and leave a stub that cannot answer in its place. Nothing
// here writes _VWO. The same mistake shipped in extra/adobe-launch.js as
// window.__satelliteLoaded and took a field report to find.
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
    // Once only: their finish guards itself, their overlay does not.
    let toldThem = false;
    const theirExits = ( ) => {
        if ( toldThem ) { return; }
        const code = w._vwo_code;
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
            if ( watch !== null ) { watch.disconnect(); watch = null; }
        }, { once: true });
    }
})();
