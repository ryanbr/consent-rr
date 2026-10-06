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

    Shared implementation for consentmanager-reject.js and
    consentmanager-reject-unblock.js.

    consentmanager.net, from Jaeger & Kloss. Measured on two tenants'
    delivery, fasthosts.co.uk and dastelefonbuch.de, across all four files
    they serve.

    WHAT A PAGE ACTUALLY DOWNLOADS, and why one rule is worth having:

      delivery/js/semiautomatic.min.js    18KB   the bootstrap: it builds the
                                                 cmp.php url from window
                                                 globals and loads the bundle
      delivery/cmp.php?cdid=...&h=...      6KB   per tenant: window
                                                 .cmp_config_data, the loader
                                                 functions, and the request
                                                 for the custom data
      delivery/js/cmp_final.min.js       493KB   the CMP itself
      delivery/customdata/<base64>.js  43-147KB  per tenant vendor data

    Replacing the bootstrap or cmp.php takes the rest with it: better than
    half a megabyte a visitor stops fetching, and the customdata name is
    itself the configuration - base64 of
    m_1.w_170577.r_GDPR.l_en.d_53863.x_130.v.p.t_53863.xt_118.

    THE RECORD THAT MATTERS IS NOT THEIRS. Their own consent record is
    __cmpconsent<id> or __cmpconsentx<id> or __cmpconsents<id>, keyed on
    consentscope with a per-tenant id, both of which live in cmp_config_data
    inside the file being replaced - so the name cannot be known from
    outside. NOTHING ELSE READS IT: grepped across their bootstrap, their
    cmp.php, and both tenants' customdata, the only reader is the 493KB
    bundle, and that is the file being replaced. So it is not written here,
    and an invented name would be a record of this repo's making.

    What third parties read is the IAB layer, and theirs writes the standard
    cookie for it:

        r.alt = o > 0 ? (s ? "euconsent-v2" : "nc_euconsent-v2")
                      : (s ? "euconsent" : "nc_euconsent");

    so euconsent-v2 is written here, by lib/consentmanager-tcf.js, with a
    string that grants nothing.

    THEIR EVENTS GO TO TWO DIFFERENT TARGETS, which is the sort of thing that
    quietly reaches nobody if it is assumed:

        window.dispatchEvent(new CustomEvent("cmpEvent",
            {detail: {type: e, subtype: t, data: i}}));
        window.dispatchEvent(new CustomEvent("cmpEvent_" + e, {detail: ...}));
        ...
        document.dispatchEvent(new CustomEvent("wp_consent_type_defined"));

    cmpEvent and cmpEvent_<type> at the WINDOW, and their WordPress Consent
    API bridge at the DOCUMENT, next to window.wp_consent_type and a
    wp_set_consent call per category.

    NOT DONE HERE, deliberately:

      no banner          nothing is built, and their own markup is left as
                         the page wrote it.
      no cross-domain    their writeStore posts cmpcd:set:<key>=<value> into a
                         __cmpcdframe iframe, which is how a choice is shared
                         between a customer's domains through their server.
                         Nothing is shared from here.
      no tracking        theirs calls out to Microsoft Clarity, Microsoft UET
                         and Xandr, and pushes a data layer event, when a
                         decision is made.
      no cookie purge    theirs deletes the cookies of non-consented vendors
                         from a per-tenant list in the replaced file. uBlock
                         Origin blocks the requests that would set them.

*/

// @include ../../shared/lib/deferred.js

function consentRRConsentManager(mode, installTcf) {
    const w = window;
    const doc = w.document;
    // Substituted from package.json by tools/build.mjs.
    const VERSION = '@@VERSION@@';
    const NAME = 'consentmanager-' + mode;
    // reject-unblock refuses exactly as reject does and still lets the parked
    // tags go: un-parking one claims no consent, and uBlock Origin still
    // blocks whatever it then asks for.
    const reviveAll = mode === 'reject-unblock';

    const standing = typeof w.cmpmngr === 'object' && w.cmpmngr !== null
        ? w.cmpmngr
        : null;
    if ( standing !== null && standing.consentRR !== undefined ) { return; }

    const noopfn = function() {
    }.bind();
    const noopstrfn = function() {
        return '';
    }.bind();
    const noopfalsefn = function() {
        return false;
    }.bind();
    const nooparrayfn = function() {
        return [];
    }.bind();

    // Their IAB identity, which their own cmp.php states as "iabid":31.
    const CMP_ID = 31;
    const PURPOSES = 11;

    /**************************************************************************/

    // Their events: two targets, and that is theirs rather than a choice.
    let events = 0;
    const fireWindow = (name, detail) => {
        try {
            w.dispatchEvent(new w.CustomEvent(name, { detail: detail }));
            events += 1;
        } catch ( ex ) {
        }
    };
    const fireDocument = name => {
        try {
            doc.dispatchEvent(new w.CustomEvent(name));
            events += 1;
        } catch ( ex ) {
        }
    };

    /**************************************************************************/

    // THEIR PAYLOADS, KEY FOR KEY. Each command answers a different object,
    // and these were taken out of their own bundle rather than guessed - a
    // first pass here invented a dozen field names and missed as many real
    // ones. getCMPData carries thirty-four:
    //
    //   {cmpDataObject:!0, consentstring:..., uspstring:"",
    //    gdprApplies:..., hasGlobalScope:!1, tcfversion:...,
    //    tcfcaversion:..., gppversions:..., gppdata:this.gpp_ping(),
    //    gppmanifests:..., tcfcompliant:..., regulation:getRegulation(),
    //    regulationKey:getRegulationKey(), purposeConsents:..., ...}
    //
    // Note purposeLI and vendorLI, not purposeLIs; hasGlobalScope, not
    // hasGlobalConsent; and no cmpId at all - that one lives on their ping.
    const flags = count => {
        const out = {};
        for ( let id = 1; id <= count; id += 1 ) { out[id] = false; }
        return out;
    };

    const cmpData = ( ) => ({
        cmpDataObject: true,
        consentstring: '',
        uspstring: '',
        gdprApplies: true,
        hasGlobalScope: false,
        tcfversion: 2,
        tcfcaversion: 0,
        gppversions: [],
        gppdata: {},
        gppmanifests: {},
        tcfcompliant: true,
        regulation: 1,
        regulationKey: 'GDPR',
        purposeConsents: flags(PURPOSES),
        vendorConsents: {},
        purposeLI: flags(PURPOSES),
        vendorLI: {},
        googleVendorConsents: {},
        vendorsList: [],
        // Theirs is cmp_gc("pubcc","EU").substr(0,2).toLowerCase().
        publisherCC: 'eu',
        addtlConsent: '',
        purposesList: [],
        purModeActive: false,
        purModeLoggedIn: false,
        purModeLogic: 0,
        // A choice exists and the visitor made it, so nothing re-prompts.
        consentExists: true,
        userChoiceExists: true,
        pauseChoice: false,
        pauseChoiceUntil: 0,
        lastButtonEvent: '',
        dataLayerCounter: 0,
        choiceType: -1,
        consentCreated: 0,
        consentUpdated: 0,
    });

    // Their v1-style payload, which is three fields and not the one above.
    const consentData = ( ) => ({
        consentData: '',
        gdprApplies: true,
        hasGlobalScope: false,
    });

    // Their vendor-consents payload, which carries the custom pair that
    // getCMPData does not.
    const vendorConsents = ( ) => ({
        consentstring: '',
        gdprApplies: true,
        hasGlobalScope: false,
        purposeConsents: flags(PURPOSES),
        customPurposeConsents: {},
        vendorConsents: {},
        customVendorConsents: {},
        googleVendorConsents: {},
        addtlConsent: '',
    });

    // Their geo, from the configuration in the file being replaced - so
    // empty here rather than invented. Theirs reads cmp_gc("usr_cc") and
    // cmp_gc("usr_regio"), which their server fills in.
    const userGeo = ( ) => ({ cmpUserCountry: '', cmpUserRegion: '' });

    // Their ping, which is version-gated: anything but 2 answers FALSE.
    const ping = version => {
        if (Number(version) !== 2) { return false; }
        return {
            gdprApplies: true,
            cmpLoaded: true,
            cmpStatus: 'loaded',
            displayStatus: 'hidden',
            apiVersion: '2.3',
            // Theirs is wsid % 2000, from the website id in the replaced
            // file. Informational.
            cmpVersion: 1,
            cmpId: CMP_ID,
            gvlVersion: 1,
            tcfPolicyVersion: 5,
        };
    };

    // Their consentStatus and checkConsent, each its own shape.
    const consentStatus = ( ) => ({
        consentExists: true,
        userChoiceExists: true,
        regulation: 1,
        regulationKey: 'GDPR',
    });
    const checkConsent = ( ) => ({ consent: false, vendors: {} });

    /**************************************************************************/

    // Their parked markup, and their own un-parking contract - measured,
    // because an invented attribute is an invented behaviour:
    //
    //   .cmplazyload                 the parked element
    //   data-cmp-src                 the source moved aside
    //   data-cmp-type                the type to restore, text/javascript
    //                                where it is absent or text/plain
    //   data-cmp-hide-display        the display to put back
    //   data-cmp-onload              an onload to reattach
    //   data-cmp-ab="1"              what theirs marks a freed copy with
    //
    // A script gets a COPY inserted before it, which is what theirs does: a
    // type alone does not run a script already in the document.
    let revived = 0;
    // Theirs marks the copy with data-cmp-ab and leaves the parked node where
    // it is, so the node keeps its .cmplazyload class and keeps matching. A
    // pass over the page therefore has to remember what it has already freed,
    // or a second pass copies the same tag again - and the copy's own
    // insertion is a mutation, so an observer would do it without end. Held
    // here rather than written onto the page, because the page is theirs.
    const seen = new WeakSet();
    const revive = ( ) => {
        if ( reviveAll === false ) { return 0; }
        let freed = 0;
        let nodes = [];
        try {
            nodes = Array.from(doc.querySelectorAll('.cmplazyload'));
        } catch ( ex ) {
            return 0;
        }
        for ( const node of nodes ) {
            // The copy carries the class over, so it matches the selector
            // too - which is what their own data-cmp-ab marker is for, and
            // why it is read here before anything else.
            if ( node.hasAttribute('data-cmp-ab') ) { continue; }
            if ( seen.has(node) ) { continue; }
            seen.add(node);
            try {
                const src = node.getAttribute('data-cmp-src');
                const named = node.nodeName.toLowerCase();
                let type = node.getAttribute('data-cmp-type') || '';
                if ( type === '' || type === 'text/plain' ) {
                    type = 'text/javascript';
                }
                if ( node.hasAttribute('data-cmp-hide') ||
                    node.hasAttribute('data-cmp-hide-display') ) {
                    node.style.display =
                        node.getAttribute('data-cmp-hide-display') || '';
                }
                if ( named === 'iframe' ) {
                    if ( src === null ) { continue; }
                    const onload = node.getAttribute('data-cmp-onload');
                    if ( onload !== null ) {
                        node.setAttribute('onload', onload);
                    }
                    node.setAttribute('src', src);
                    node.setAttribute('data-cmp-ab', '1');
                    revived += 1;
                    freed += 1;
                    continue;
                }
                if ( named !== 'script' ) { continue; }
                const copy = doc.createElement('script');
                for ( const attribute of Array.from(node.attributes) ) {
                    if ( attribute.name === 'type' ) { continue; }
                    if ( attribute.name === 'src' ) { continue; }
                    copy.setAttribute(attribute.name, attribute.value);
                }
                copy.setAttribute('data-cmp-ab', '1');
                copy.type = type;
                copy.async = true;
                if ( src !== null ) {
                    copy.src = src;
                } else if ( node.getAttribute('src') !== null ) {
                    copy.src = node.getAttribute('src');
                } else {
                    copy.textContent = node.textContent;
                }
                node.parentElement.insertBefore(copy, node);
                revived += 1;
                freed += 1;
            } catch ( ex ) {
            }
        }
        return freed;
    };

    /**************************************************************************/

    // THEIR COMMAND TABLE, measured out of their own dispatcher rather than
    // guessed. A first pass here invented nine command names and missed most
    // of these:
    const COMMANDS = [
        'ping', 'addEventListener', 'removeEventListener', 'getVendorList',
        'consentStatus', 'setUserID', 'setUserID2', 'setUserID3', 'getUserID',
        'setAgeCallback', 'setConsent', 'showScreen', 'showScreenAdvanced',
        'showCCPAScreen', 'showCCPAScreenAdvanced', 'hide', 'close',
        'getTCData', 'getCMPData', 'getUserLocation', 'getUserGeo',
        'getConsentData', 'getVendorConsents', 'checkConsent',
        'getFullTCData', 'gpp.ping', 'gpp.addEventListener',
        'gpp.removeEventListener', 'gpp.hasSection', 'gpp.getSection',
        'gpp.getField', 'gpp.getGPPData', 'dsa.collect',
    ];

    const listeners = new Map();
    let nextId = 0;
    let answered = 0;

    // Their own callback shape: cb(callback, data, success).
    const cb = (callback, value, success) => {
        answered += 1;
        if ( typeof callback !== 'function' ) { return value; }
        try {
            callback(value, success !== false);
        } catch ( ex ) {
        }
        return value;
    };

    // Their __cmp takes (command, parameter, callback, version), and every
    // command answers its own payload. A page asking for a decision does not
    // get to make one: their setters and screen openers are answered rather
    // than obeyed, because the answer is already no.
    const cmp = (command, parameter, callback, version) => {
        const name = String(command);
        if ( name === 'ping' ) {
            const answer = ping(version === undefined ? 2 : version);
            return cb(callback, answer, answer !== false);
        }
        if ( name === 'addEventListener' ) {
            nextId += 1;
            listeners.set(nextId, callback);
            const data = cmpData();
            data.listenerId = nextId;
            return cb(callback, data, true);
        }
        if ( name === 'removeEventListener' ) {
            const existed = listeners.delete(parameter);
            return cb(callback, existed, existed);
        }
        if ( name === 'getCMPData' || name === 'getFullTCData' ) {
            return cb(callback, cmpData(), true);
        }
        if ( name === 'getConsentData' ) {
            return cb(callback, consentData(), true);
        }
        if ( name === 'getVendorConsents' ) {
            return cb(callback, vendorConsents(), true);
        }
        if ( name === 'getUserLocation' || name === 'getUserGeo' ) {
            return cb(callback, userGeo(), true);
        }
        if ( name === 'consentStatus' ) {
            return cb(callback, consentStatus(), true);
        }
        if ( name === 'checkConsent' ) {
            return cb(callback, checkConsent(), true);
        }
        // Theirs answers an empty object here.
        if ( name === 'getVendorList' ) { return cb(callback, {}, true); }
        if ( COMMANDS.includes(name) ) {
            return cb(callback, cmpData(), true);
        }
        return cb(callback, null, false);
    };

    /**************************************************************************/

    // THEIR OBJECT LAYOUT, which is the part a first pass here got wrong
    // outright. Everything page-facing hangs off cmpmngr.api, and the window
    // functions are thin delegates:
    //
    //   window.__cmp = function(e,t,i,n) {
    //       return window.cmpmngr.api.__cmp(e,t,i,n); };
    //   "__tcfapi" in window && (window.__tcfapi = ...api.__tcfapi...);
    //   "__gpp" in window && (window.__gpp = ...api.__gpp...);
    //   "__dsa" in window && (window.__dsa = ...api.__dsa...);
    //
    // Note the "in window" guards: theirs only replaces a stub a page already
    // installed. The IAB layer here installs __tcfapi regardless, because a
    // page that waits on it would otherwise wait forever once the request is
    // blocked - the same call made for CookieYes, and the console line
    // reports it either way.
    const apiObject = {
        __cmp: cmp,
        __tcfapi: (command, version, callback, parameter) =>
            cmp(command, parameter, callback, version),
        __gpp: (command, callback, parameter, version) =>
            cmp('gpp.' + command, parameter, callback, version),
        __dsa: (command, callback, parameter, version) =>
            cmp('dsa.' + command, parameter, callback, version),
        getCMPData: cmpData,
        getConsentData: consentData,
        getVendorConsents: vendorConsents,
        getUserGeo: userGeo,
        ping: ping,
        consentStatus: consentStatus,
        checkConsent: checkConsent,
        getVendorList: ( ) => ({}),
        fireEvent: noopfn,
        cb: cb,
        // Their reporting, kept inert: theirs posts to Microsoft Clarity,
        // Microsoft UET and Xandr, and pushes a data layer event.
        sendMicrosoftClarityTracking: noopfn,
        sendMicrosoftUETTracking: noopfn,
        sendXandrTracking: noopfn,
        sendWordpressTracking: noopfn,
        sendDataLayerEvent: noopfn,
        lastButtonEvent: '',
        dataLayerCounter: 0,
    };

    // And cmpmngr itself, with the methods theirs actually carries. A first
    // pass put seventeen here that their bundle has no trace of, which is a
    // page feature-detecting its way down a path their CMP never offered.
    const api = {
        api: apiObject,
        consentstring: '',
        gdprApplies: true,
        tcfversion: 2,
        tcfcaversion: 0,
        tcfcompliant: true,
        iabid: CMP_ID,
        purposes: [],
        vendors: [],
        hasExistingChoice: true,
        hasExistingUserChoice: true,
        getRegulation: ( ) => 1,
        getRegulationKey: ( ) => 'GDPR',
        getConsentStatus: ( ) => -1,
        getPurposeConsent: noopfalsefn,
        getVendorConsent: noopfalsefn,
        getPurposes: nooparrayfn,
        hasConsent: noopfalsefn,
        setConsent: noopfn,
        log: noopfn,
        consentRR: { name: NAME, version: VERSION, mode: mode },
    };

    const out = standing !== null ? standing : {};
    for ( const key of Object.keys(api) ) { out[key] = api[key]; }
    w.cmpmngr = out;

    // Their own wiring: a thin delegate, so a page that reassigns
    // cmpmngr.api still reaches what it put there.
    try {
        w.__cmp = (command, parameter, callback, version) =>
            w.cmpmngr.api.__cmp(command, parameter, callback, version);
        w.__cmp.consentRR = VERSION;
    } catch ( ex ) {
    }

    // Their US privacy answer, which their own bundle puts up too. 1YYN:
    // notice given, sale opted out, not an LSPA deal.
    const uspString = '1YYN';
    const uspapi = (command, version, callback) => {
        if ( typeof callback !== 'function' ) { return; }
        if ( version > 1 ) { return callback(null, false); }
        if ( String(command).toLowerCase() !== 'getuspdata' ) {
            return callback(null, false);
        }
        callback({ version: 1, uspString: uspString }, true);
    };
    if ( typeof w.__uspapi !== 'function' ) {
        w.__uspapi = uspapi;
    }

    /**************************************************************************/

    const tcf = typeof installTcf === 'function'
        ? (installTcf().install() ? 'refused' : 'theirs')
        : 'absent';

    // Only where there is something to free: the plain refusal frees nothing
    // by design, so it does not want an observer watching the page for it.
    if ( reviveAll ) {
        consentRRDeferred(w, doc, revive, NAME + ' ' + VERSION);
    }

    // Their WordPress Consent API bridge: the type at the document, the
    // global next to it, and a call per category where the site has one.
    let told = 0;
    try {
        w.wp_consent_type = 'optout';
        fireDocument('wp_consent_type_defined');
        if ( typeof w.wp_set_consent === 'function' ) {
            for ( const category of [
                'functional', 'preferences', 'statistics',
                'statistics-anonymous', 'marketing',
            ] ) {
                w.wp_set_consent(category, 'deny');
                told += 1;
            }
        }
    } catch ( ex ) {
    }

    // Their own, at the window, with the shape their dispatcher builds.
    const data = cmpData();
    for ( const type of [ 'cmpready', 'consent' ] ) {
        fireWindow('cmpEvent', { type: type, subtype: '', data: data });
        fireWindow('cmpEvent_' + type, { type: type, subtype: '', data: data });
    }

    // Said once, at the end, so it reports what actually went in.
    if ( typeof console === 'object' && typeof console.info === 'function' ) {
        console.info(
            '[consent-rr] ' + NAME + ' ' + VERSION +
            ' purposes=none vendors=none' +
            ' api=__cmp+__uspapi' +
            ' tcf=' + tcf +
            ' freed=' + revived +
            ' events=' + events +
            ' told=' + told +
            ' banner=none crossdomain=none tracking=none'
        );
    }
}
