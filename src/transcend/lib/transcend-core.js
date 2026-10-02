/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/ryanbr/consent-rr

    Stands in for Transcend's ui.js - the banner - and records the refusal
    through airgap's own API.

    Transcend splits in two, and which half to replace matters:

      airgap.js   the engine, and the tenant's whole configuration with it: the
                  purposes, the cookie-to-purpose table, the allowed hosts. It
                  blocks requests and cookies itself, by consent, and it owns
                  the tcm cookie. Leave it alone - with a refusal recorded it is
                  the thing enforcing it, and replacing it would mean dropping
                  its blocking and reimplementing the API it exposes.
      ui.js       the banner, 390kB of Preact, loaded only when airgap decides
                  to prompt. Nothing is expected back from it, so a stub that
                  renders nothing is a banner that never appears.

    Read off airgap.js and off a site's own UI built on it rather than from
    documentation:
      self.airgap           installed as { readyQueue, ready(cb), ... }, and
                            airgap.js spreads an existing one over its own, so a
                            callback queued before it loads survives and runs
      getConsent()          { purposes: { <name>: boolean|"Auto" }, timestamp,
                            confirmed, prompted, updated }
      setConsent(auth, purposes, options)   options { confirmed, prompted,
                            timestamp }, and auth may be null where the tenant
                            does not require a trusted event - which is how a
                            site's own consent manager records a choice made
                            without a click
      the purpose names     come from getConsent(), so none has to be known
                            here: whatever the tenant calls them, they are all
                            set to false

    Which auth their setConsent will take is their requireAuth option, and it is
    on unless a tenant turns it off - four tenants sampled all left it on. So
    the auth is their own load branch:

        isTrusted(e) && e.type === "load" && e.timeStamp <= <init time>

    a trusted load event, which every page fires - their path for a decision
    nobody clicked. That is waited for rather than guessed at, and it records
    the refusal on this page. Where the page has already loaded by the time
    this runs, that event has gone, and the refusal is written to their tcm
    cookie instead - which is read on the next page rather than this one. The
    console line says which way it went: setConsent, load or cookie.

*/

function consentRRTranscend() {
    const w = self;
    const doc = w.document;
    const VERSION = '@@VERSION@@';
    const NAME = 'transcend-reject';
    const COOKIE = 'tcm';

    const existing = w.airgap;
    if ( existing !== null && typeof existing === 'object' ) {
        if ( existing.consentRR !== undefined ) { return; }
    }

    // Their own stub shape. Injected at document_start there is no airgap yet,
    // and airgap.js spreads whatever it finds over its own definition - so a
    // queue put here is the queue it drains.
    if ( existing === null || typeof existing !== 'object' ) {
        w.airgap = {
            readyQueue: [],
            ready: function(callback) {
                this.readyQueue.push(callback);
            },
        };
    }
    w.airgap.consentRR = {
        mode: 'reject',
        version: VERSION,
    };

    const readCookie = name => {
        const pairs = String(doc.cookie).split(';');
        for ( const pair of pairs ) {
            const pos = pair.indexOf('=');
            if ( pos === -1 ) { continue; }
            if ( pair.slice(0, pos).trim() !== name ) { continue; }
            return pair.slice(pos + 1).trim();
        }
        return undefined;
    };

    let cookieDomain;

    const findCookieDomain = ( ) => {
        const host = String(w.location.hostname);
        if ( host === '' || /^[[\d.]/.test(host) ) { return ''; }
        const labels = host.split('.');
        const probe = 'consentRRProbe';
        for ( let i = labels.length - 2; i >= 0; i-- ) {
            const candidate = labels.slice(i).join('.');
            try {
                doc.cookie = probe + '=1; path=/; domain=' + candidate;
                if ( readCookie(probe) !== '1' ) { continue; }
                doc.cookie = probe + '=; path=/; max-age=0; domain=' + candidate;
                return candidate;
            } catch(ex) {
            }
        }
        return '';
    };

    // Last resort, for a tenant whose airgap will not take a decision without
    // a trusted event. Their own cookie carries this record as plain JSON.
    const writeCookie = purposes => {
        const value = JSON.stringify({
            purposes,
            timestamp: new Date().toISOString(),
            confirmed: true,
            prompted: true,
            updated: false,
        });
        if ( cookieDomain === undefined ) {
            try {
                cookieDomain = findCookieDomain();
            } catch(ex) {
                cookieDomain = '';
            }
        }
        const secure = w.location.protocol === 'https:' ? '; secure' : '';
        const attributes = '; path=/; max-age=31536000; samesite=lax' + secure;
        try {
            if ( cookieDomain !== '' ) {
                doc.cookie = COOKIE + '=; path=/; max-age=0';
                doc.cookie = COOKIE + '=' + value + attributes +
                    '; domain=' + cookieDomain;
                if ( readCookie(COOKIE) === value ) { return true; }
            }
            doc.cookie = COOKIE + '=' + value + attributes;
            return readCookie(COOKIE) === value;
        } catch(ex) {
        }
        return false;
    };

    const announce = (names, how) => {
        if ( typeof console !== 'object' ) { return; }
        if ( typeof console.info !== 'function' ) { return; }
        console.info(
            '[consent-rr] ' + NAME + ' ' + VERSION +
            ' refused=' + (names.length !== 0 ? names.join(',') : '(none)') +
            ' via=' + how
        );
    };

    const refuse = airgap => {
        let purposes = {};
        try {
            const consent = airgap.getConsent();
            if ( consent !== null && typeof consent === 'object' ) {
                if ( consent.purposes !== null && typeof consent.purposes === 'object' ) {
                    purposes = consent.purposes;
                }
            }
        } catch(ex) {
        }
        // Whatever this tenant calls its purposes, every one of them is off.
        // Essential is not among them: airgap keeps that outside consent.
        const refused = {};
        for ( const name of Object.keys(purposes) ) { refused[name] = false; }
        const names = Object.keys(refused);
        if ( names.length === 0 ) {
            announce(names, 'nothing to refuse');
            return;
        }
        const options = ( ) => ({
            confirmed: true,
            prompted: true,
            timestamp: new Date().toISOString(),
        });
        const record = auth => {
            try {
                return airgap.setConsent(auth, refused, options()) !== false;
            } catch(ex) {
            }
            return false;
        };

        // Their requireAuth option decides whether a decision needs proof of a
        // real interaction. Where it is off, null is proof enough - which is
        // what a site's own manager passes for a choice nobody clicked - and
        // asking first keeps their own "Authorization proof is untrusted" out
        // of the console on every other tenant.
        const authOff = airgap.loadOptions !== null &&
            typeof airgap.loadOptions === 'object' &&
            airgap.loadOptions.requireAuth === 'off';
        if ( authOff && record(null) ) {
            announce(names, 'setConsent');
            return;
        }

        // Otherwise their check wants a trusted event, and their own load
        // branch takes one: isTrusted, of type load, which is what every page
        // fires. That is the path for a decision not made by clicking, and it
        // lands on this page rather than the next.
        if ( doc.readyState !== 'complete' ) {
            w.addEventListener('load', ev => {
                if ( record(ev) ) {
                    announce(names, 'load');
                    return;
                }
                announce(names, writeCookie(refused) ? 'cookie' : 'refused');
            }, { once: true });
            return;
        }
        // Loaded already, so that event has been and gone: their cookie is
        // what is left, and it is read on the next page rather than this one.
        announce(names, writeCookie(refused) ? 'cookie' : 'refused');
    };

    try {
        w.airgap.ready(refuse);
    } catch(ex) {
    }
}
