/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    Re-running a pass over the document as the document arrives.

    A resource replacement runs where the CMP's own script tag is, which is in
    <head>, and uBlock Origin runs it at document_start. Everything the page
    parks for a CMP to free - a script with type="text/plain", a div a widget
    would have filled - is below that point and does not exist yet. A single
    synchronous querySelectorAll at boot therefore matches nothing and frees
    nothing, on every page that puts its tags where pages put them.

    Measured in jsdom with the resource inline in <head> and one parked tag in
    the body: six of the seven resources that free parked tags freed nothing.
    The seventh was onetrust, which carries this pass-again mechanism of its
    own - which is where the shape below comes from.

    So: run the scan now, again on every batch of added nodes, again at
    DOMContentLoaded, and a last time at load. The scan is debounced because a
    loading page delivers nodes continuously, and the observer is kept after
    load because a tag manager injects parked tags long after it. Every caller's
    scan replaces the node it frees, so running it again is a no-op.

*/

function consentRRDeferred(w, doc, scan, label) {
    'use strict';

    // The boot console line reports what the first pass freed, which on a real
    // page is nothing, because nothing is there yet. So a pass after the first
    // that frees something says so, and a pass that frees nothing stays quiet.
    let passes = 0;
    const run = ( ) => {
        let freed = 0;
        try {
            freed = scan();
        } catch ( ex ) {
        }
        passes += 1;
        if ( passes === 1 || typeof freed !== 'number' || freed === 0 ) { return; }
        if ( typeof label !== 'string' || label === '' ) { return; }
        if ( typeof console !== 'object' ) { return; }
        if ( typeof console.info !== 'function' ) { return; }
        console.info('[consent-rr] ' + label + ' freed=' + freed + ' deferred');
    };

    let timer;
    const flush = ( ) => {
        timer = undefined;
        run();
    };

    const defer = ( ) => {
        if ( timer !== undefined ) { return; }
        try {
            timer = w.setTimeout(flush, 100);
        } catch ( ex ) {
            run();
        }
    };

    run();

    try {
        new w.MutationObserver(defer).observe(doc.documentElement || doc, {
            childList: true,
            subtree: true,
        });
    } catch ( ex ) {
    }

    // The decisive pass: at DOMContentLoaded the whole document is there, so
    // this one is not debounced - a page is not left waiting on a timer for
    // something it parked before the parser finished.
    try {
        if ( doc.readyState === 'loading' ) {
            doc.addEventListener('DOMContentLoaded', run, { once: true });
        }
        if ( doc.readyState !== 'complete' ) {
            w.addEventListener('load', run, { once: true });
        }
    } catch ( ex ) {
    }
}
