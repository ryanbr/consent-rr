/// vwo.js
// Resource replacement for VWO (Visual Website Optimizer, Wingify) settings
// served from dev.visualwebsiteoptimizer.com/j.php, which is the campaign
// settings AND the library in one 157KB script.
// Not a cookie-consent resource: it lives outside src/ and is not built
// into dist/ by tools/build.mjs. Hand-maintained, ship as-is.
// THE NOTES ARE IN extra/vwo.md - the page-hiding contract, every member
// and where it came from, and what a page keeps and loses.
// The comments below are a line each; the reasoning for them is there.
//
// THE RULE
//   ||dev.visualwebsiteoptimizer.com/j.php$script,redirect=vwo.js
// Blocking this alone hides the page. Their snippet writes a style that
// hides hide_element, usually the body, and only takes it away when the
// settings answer or a timer expires - so a block is a blank page for
// settings_tolerance, 2000ms on a default install. This replacement takes
// the hiding away at once.
// On Chromium a redirect naming a USER resource does not inject and does
// not block: the request is simply allowed. There it has to be a scriptlet
// beside a blocking rule - ##+js(vwo) with the rule above as $script,
// important. Measured, see extra/adobe-launch.md.
//
// Lines starting with // at column zero are dropped by uBO and a blank
// line ends the resource, so neither may appear below.
(function() {
    'use strict';
    const w = window;
    const doc = document;
    const existing = w.VWO;
    // Their own library is here already: do nothing. The scriptlet form
    // blocks nothing, so the real one may arrive right after this.
    if (
        existing !== null && existing !== undefined &&
        Array.isArray(existing) === false &&
        typeof existing.load_co === 'function'
    ) {
        return;
    }
    const noopfn = ( ) => { };
    // Their dup-code guard is window._VWO.sCL, and a payload that sees it
    // set logs dupCode and returns without applying anything. Nothing here
    // writes _VWO, for the reason extra/adobe-launch.md records at length:
    // setting the other vendor's double-init flag made a real library stand
    // down and left a stub that could not answer in its place.
    const api = {
        // Absorbs what a page queues. Nothing queued is run: these are
        // their campaign and tracking calls, which is what is being
        // replaced, and running a page's callbacks is not this file's job.
        push: noopfn,
        // Their pixel sender - s.gif, e.gif, c.gif, h.gif, l.gif, ee.gif.
        collect: noopfn,
        // Injects a script element. Never, or the replacement fetches the
        // very library the rule above is there to keep off the page.
        load_co: noopfn,
        nonce: '',
        visUuid: '',
        data: {},
        appliedCampaigns: [],
        _: {
            // safeExecute: their first lines wrap everything in this, so
            // anything of theirs that loads from a first-party proxy finds
            // it. A regular function, to keep the caller's this.
            sE: fn => function() {
                try {
                    return fn.apply(this, arguments);
                } catch ( ex ) {
                }
            },
            domains: {},
            sD: noopfn,
        },
    };
    w.VWO = api;
    // Taking the page back. Their snippet, the element with id vwoCode,
    // writes a style with id _vis_opt_path_hides and arms a timer that
    // calls finish() when the settings do not arrive.
    // Their own two exits, in their own order: the overlay first, then
    // finish, which sets the flag finished() reports and takes the style
    // away. Calling theirs rather than only removing the node keeps a page
    // that asks finished() honest.
    //
    // Once only, and the flag is set when the object is found rather than
    // at the top: the pass below runs again as the document arrives, and
    // their finish guards itself while removeLoaderAndOverlay does not -
    // it ran three times before a test pinned it to the one their own
    // code makes.
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
        // The belt under it: a page can carry two of these, which is why
        // their own cleanup indexes querySelectorAll rather than calling
        // getElementById - that only ever finds the first.
        try {
            const hides = doc.querySelectorAll('#_vis_opt_path_hides');
            for ( const el of hides ) {
                if ( el.parentNode === null ) { continue; }
                el.parentNode.removeChild(el);
            }
        } catch ( ex ) {
        }
        // Their timer would call finish later anyway, so this only saves a
        // stray wake-up, and their own dup-code path clears it the same
        // way. It is after their exits rather than before for reading
        // order and nothing more: the sweep showed the two orders cannot
        // be told apart, because the style removal above already does what
        // their finish would have done if it threw. An earlier comment
        // here claimed the order was a safety net, and a test written to
        // prove that claim failed - the claim was wrong, not the code.
        try { w.clearTimeout(w._vwo_settings_timer); } catch ( ex ) { }
    };
    release();
    // At document_start the snippet has not run, so none of the above
    // exists yet and the style cannot be found. The pass has to run again
    // as the document arrives - the rule AGENTS.md records for parked tags.
    if ( doc.readyState === 'loading' ) {
        let watch = null;
        // The head only, and its own children only: their style goes
        // there, and a subtree watch on the document makes the engine
        // build a record for every node the page parses.
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
