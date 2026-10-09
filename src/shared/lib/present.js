/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    RUN ONLY WHERE THE CMP IS, for the install that has to be global.

    A $redirect= rule naming a user resource cannot work on Chromium: uBO
    gives one of its own resources a warURL and serves it out of the
    extension, while one of yours has only its bytes -

        this.resources.set(name, RedirectEntry.fromDetails({
            mime, data, origin: 'user' }));

    - so toURL() can only return a data: URI, traffic.js hands that to the
    browser unchanged, and Chromium refuses to redirect a request to data:.
    The request fails outright: ERR_UNSAFE_REDIRECT, with neither the CMP's
    script nor the replacement loaded.

    What does work there is scriptlet injection, and a filter list wants that
    global - one line, every site - rather than a line per site. Which means
    the resource is injected into pages that have never heard of its CMP, and
    measured on a page with nothing on it, 44 of the 46 resources here wrote a
    cookie, installed a global, changed the document or said a line. None of
    that belongs on somebody else's page.

    So the body runs when the CMP is actually there, and not otherwise:

      - already there: run now, which is also the $redirect= case, where the
        resource stands in for a file the CMP's own loader asked for.
      - not yet: watch for the page to define it. A CMP's loader assigns its
        global before anything of it can be used, so the assignment is the
        signal - caught with an accessor, which is handed straight back as a
        plain property so the page sees what it wrote.
      - never: nothing happens. No global with a value, no cookie, no line.

    The accessor leaves the name present-but-undefined while it waits, which
    a page testing "'name' in window" could see. Nothing else does.

*/

function consentRRWhenPresent(w, probes, run) {
    'use strict';

    const names = Array.isArray(probes.globals) ? probes.globals : [];

    const held = name => {
        try {
            const value = w[name];
            if ( value === null || value === undefined ) { return undefined; }
            if ( typeof value !== 'object' && typeof value !== 'function' ) {
                return undefined;
            }
            return value;
        } catch ( ex ) {
        }
        return undefined;
    };

    for ( const name of names ) {
        const already = held(name);
        if ( already !== undefined ) {
            run(name, already);
            return;
        }
    }

    // One run, whichever name arrives first. With a single probe this guard
    // cannot be reached and no test holds it - it is here for a family that
    // names two of a CMP's globals, where either may be assigned first.
    let done = false;
    const once = (name, value) => {
        if ( done ) { return; }
        done = true;
        run(name, value);
    };

    for ( const name of names ) {
        let waiting;
        try {
            const own = Object.getOwnPropertyDescriptor(w, name);
            if ( own !== undefined && own.configurable === false ) { continue; }
            Object.defineProperty(w, name, {
                configurable: true,
                enumerable: true,
                get: function() { return waiting; },
                set: function(value) {
                    waiting = value;
                    // Back to a plain property first, so the page and the
                    // CMP see exactly what the page wrote, and so a second
                    // assignment of theirs is an ordinary one.
                    try {
                        Object.defineProperty(w, name, {
                            value: value,
                            writable: true,
                            enumerable: true,
                            configurable: true,
                        });
                    } catch ( ex ) {
                    }
                    if ( value === null || value === undefined ) { return; }
                    if (
                        typeof value !== 'object' &&
                        typeof value !== 'function'
                    ) {
                        return;
                    }
                    once(name, value);
                },
            });
        } catch ( ex ) {
        }
    }
}
