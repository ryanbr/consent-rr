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

    Stands in for InMobi Choice's cmp2.js, the file that carries the whole CMP.

    Two files make up this CMP and the replacement goes on the second one:

      choice.js  a small per-site loader. It inserts cmp2.js, injects the
                 banner's CSS, and calls __tcfapi('init', 2, fn, config) with
                 the tenant's entire configuration inline.
      cmp2.js    the CMP. It reads that config back out of the page's IAB stub
                 by calling window.__tcfapi() with no arguments - the stub
                 returns its own queue - and takes the argument list whose
                 first entry is "init".

    Replacing cmp2.js and letting choice.js run is therefore what gets the
    tenant's own publisher country, language and legitimate-interest purposes
    into the answer. Replacing choice.js instead also works, and the defaults
    stand in, but nothing here can then be tenant-accurate.

    Read off cmp2.js rather than from documentation:
      window.__tcfapi()    with no arguments returns the queue to drain
      cookie name          euconsent-v2, and IABGPP_HDR_GppString for GPP
      cookie scope         coreConfig.cookieDomain, defaulting to the hostname
      cookie life          COOKIE_MAX_AGE, 33696000 seconds, 390 days
      window.gtag          shimmed onto dataLayer if the page has none
    addtl_consent is deliberately not written: with nothing consented to,
    cmp2.js deletes that cookie rather than writing one.

*/

function consentRRInMobi(installTcf, installGpp) {
    const w = window;
    const doc = w.document;
    const VERSION = '@@VERSION@@';
    const NAME = 'inmobi-reject';

    // cmp2.js' own COOKIE_MAX_AGE, 390 days.
    const COOKIE_MAX_AGE = 33696000;
    const CONSENT_COOKIE = 'euconsent-v2';
    const GPP_COOKIE = 'IABGPP_HDR_GppString';
    // No notice was given and no opt-out applies, which is what a visitor
    // outside the tenant's US jurisdictions gets. Where in the world the
    // visitor is, this cannot know.
    const USP_STRING = '1---';

    const previous = w.__tcfapi;
    if ( typeof previous === 'function' && previous.consentRR !== undefined ) {
        return;
    }

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

    // Whatever the page's stub parked before the redirect landed. Entries are
    // argument objects, not arrays, so they are read by index.
    const drainQueue = ( ) => {
        if ( typeof previous !== 'function' ) { return []; }
        let calls = [];
        try {
            const queue = previous();
            if ( queue !== null && typeof queue === 'object' ) {
                calls = Array.prototype.slice.call(queue);
            }
        } catch(ex) {
        }
        // A stub of the other common shape parks on a property instead.
        if ( Array.isArray(previous.a) ) {
            calls = calls.concat(previous.a);
        }
        return calls;
    };

    const queued = drainQueue();

    // choice.js passes the tenant's configuration as the init call's fourth
    // argument. The last one wins, as it does in cmp2.js.
    let init;
    for ( const call of queued ) {
        if ( call === null || typeof call !== 'object' ) { continue; }
        if ( call[0] !== 'init' ) { continue; }
        init = call[3];
    }
    const config = init !== null && typeof init === 'object' ? init : {};
    const raw = config.coreConfig;
    const core = raw !== null && typeof raw === 'object' ? raw : {};
    const sawConfig = init !== undefined;

    const configured = (value, fallback) =>
        typeof value === 'string' && value !== '' ? value : fallback;
    const cookieDomain = configured(
        core.cookieDomain, String(w.location.hostname)
    );
    const cookiePath = configured(core.cookiePath, '/');

    // Attributes, order and all, are cmp2.js' own cookie writer. It scopes to
    // the hostname rather than the registrable domain, so this does too.
    const writeCookie = (name, value) => {
        const expires = new Date(Date.now() + COOKIE_MAX_AGE * 1000);
        const secure = w.location.protocol === 'https:'
            ? ';SameSite=Lax;secure'
            : '';
        const base = name + '=' + value +
            ';path=' + cookiePath +
            ';max-age=' + COOKIE_MAX_AGE +
            ';expires=' + expires.toUTCString();
        try {
            doc.cookie = base + ';domain=' + cookieDomain + secure;
            if ( readCookie(name) === value ) { return true; }
            // A domain the browser will not accept for this host leaves no
            // cookie at all and says nothing about it, so try host-only.
            doc.cookie = base + secure;
            return readCookie(name) === value;
        } catch(ex) {
        }
        return false;
    };

    // cmp2.js does this itself, before anything else: a page that calls gtag
    // without having loaded Google's own tag would otherwise throw.
    if ( typeof w.gtag !== 'function' ) {
        try {
            if ( Array.isArray(w.dataLayer) === false ) { w.dataLayer = []; }
            w.gtag = function() {
                if ( Array.isArray(w.dataLayer) === false ) { return; }
                w.dataLayer.push(arguments);
            };
        } catch(ex) {
        }
    }

    const tcf = installTcf(core);
    const tcString = tcf.tcString;
    w.__tcfapi.consentRR = {
        mode: 'reject',
        version: VERSION,
        config: sawConfig ? 'read' : 'default',
    };

    // Everything the stub parked, now that there is something to answer it.
    for ( const call of queued ) {
        if ( call === null || typeof call !== 'object' ) { continue; }
        try {
            w.__tcfapi(call[0], call[1], call[2], call[3]);
        } catch(ex) {
        }
    }

    // GPP is installed whichever encoding the tenant asked for, because a
    // script gated on __gpp stalls either way. The cookie follows the tenant:
    // cmp2.js only writes one when the mode carries GPP.
    const gppString = installGpp(tcString, tcf.section);
    const gppWanted = typeof core.gdprEncodingMode !== 'string' ||
        core.gdprEncodingMode.indexOf('GPP') !== -1;

    // The stub the page installs for the CCPA API warns on a timer until this
    // exists, and a vendor asking it gets no answer at all.
    const uspApi = (command, version, callback) => {
        if ( typeof callback !== 'function' ) { return; }
        const wrongVersion = version !== undefined && version !== null &&
            Number(version) !== 1;
        if ( wrongVersion ) {
            callback(null, false);
            return;
        }
        if ( command === 'getUSPData' ) {
            callback({ version: 1, uspString: USP_STRING }, true);
            return;
        }
        callback(null, false);
    };
    w.__uspapi = uspApi;

    // The interface bundle's own entry point. cmp2.js installs a queue for it
    // and only if the page has none, so the same restraint applies here: there
    // is no interface to open, and a call parks rather than throwing.
    if ( typeof w.__tcfapiui !== 'function' ) {
        const uiApi = function() {
            uiApi.a.push(Array.prototype.slice.call(arguments));
        };
        uiApi.a = [];
        w.__tcfapiui = uiApi;
    }

    const stored = writeCookie(CONSENT_COOKIE, tcString);
    const gppStored = gppWanted && writeCookie(GPP_COOKIE, gppString);
    const gppReport = gppWanted === false
        ? 'skipped'
        : gppStored ? 'written' : 'refused';

    if ( typeof console === 'object' && typeof console.info === 'function' ) {
        console.info(
            '[consent-rr] ' + NAME + ' ' + VERSION +
            ' config=' + (sawConfig ? 'read' : 'default') +
            ' cc=' + tcf.section.PublisherCountryCode +
            ' lang=' + tcf.section.ConsentLanguage +
            ' tcf=refused' +
            ' li=' + (tcf.keptLegitimateInterest ? 'kept' : 'objected') +
            ' gpp=refused' +
            ' usp=' + USP_STRING +
            ' cookie=' + (stored ? 'written' : 'refused') +
            ' gppcookie=' + gppReport
        );
    }
}
