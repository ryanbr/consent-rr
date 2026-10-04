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

    // Their own purpose vocabulary, from the TCF purposes their config
    // enables plus the custom slots a tenant can add. Nothing is consented.
    const PURPOSES = 11;
    const SPECIAL_FEATURES = 12;

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

    // What their getCMPData answers, which is what their own cmpEvent carries
    // and what page code reads. Everything off, nothing pending, and the
    // visitor has answered so nothing re-prompts.
    const flags = count => {
        const out = {};
        for ( let id = 1; id <= count; id += 1 ) { out[id] = false; }
        return out;
    };

    const cmpData = ( ) => ({
        cmpId: 31,
        cmpVersion: 1,
        regulation: 1,
        regulationKey: 'GDPR',
        gdprApplies: true,
        userChoiceExists: true,
        consentExists: true,
        consentstring: '',
        vendorsList: [],
        purposesList: [],
        purposeConsents: flags(PURPOSES),
        purposeLIs: flags(PURPOSES),
        vendorConsents: {},
        vendorLIs: {},
        specialFeatures: flags(SPECIAL_FEATURES),
        customPurposeConsents: {},
        customVendorConsents: {},
        hasGlobalConsent: false,
        hasConsent: false,
        hasNoConsent: true,
        settings: {},
    });

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
    const revive = ( ) => {
        if ( reviveAll === false ) { return; }
        let nodes = [];
        try {
            nodes = Array.from(doc.querySelectorAll('.cmplazyload'));
        } catch ( ex ) {
            return;
        }
        for ( const node of nodes ) {
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
            } catch ( ex ) {
            }
        }
    };

    /**************************************************************************/

    // Their own API, by the command names their bundle answers. A page's
    // callback is handed the same refusal whichever one it asks through.
    const COMMANDS = [
        'ping', 'getCMPData', 'getConsentData', 'getVendorConsents',
        'getPublisherConsents', 'consentStatus', 'getTCData', 'getUSPData',
        'addEventListener', 'removeEventListener', 'setConsent',
        'setVendorConsent', 'setPurposeConsent', 'displayConsentUi',
        'exportData', 'importData', 'rejectAll', 'acceptAll',
    ];

    const listeners = new Map();
    let nextId = 0;
    let answered = 0;

    const cmp = (command, parameter, callback) => {
        const done = (value, success) => {
            answered += 1;
            if ( typeof callback !== 'function' ) { return; }
            try {
                callback(value, success !== false);
            } catch ( ex ) {
            }
        };
        const name = String(command);
        if ( name === 'ping' ) {
            return done({
                gdprAppliesGlobally: true,
                cmpLoaded: true,
                cmpStatus: 'loaded',
                displayStatus: 'hidden',
                apiVersion: '2',
                cmpId: 31,
                cmpVersion: 1,
            });
        }
        if ( name === 'addEventListener' ) {
            nextId += 1;
            listeners.set(nextId, callback);
            const data = cmpData();
            data.listenerId = nextId;
            return done(data);
        }
        if ( name === 'removeEventListener' ) {
            const existed = listeners.delete(parameter);
            answered += 1;
            if ( typeof callback === 'function' ) {
                try {
                    callback(existed, existed);
                } catch ( ex ) {
                }
            }
            return undefined;
        }
        // A page asking for a decision does not get to make one: the answer
        // is already no, and their own setters are answered rather than
        // obeyed.
        if ( COMMANDS.includes(name) ) { return done(cmpData()); }
        return done(null, false);
    };

    /**************************************************************************/

    // Their manager object. The page-facing half of it answers; the rest is
    // inert rather than absent, because an absent method throws at the
    // caller's own call site.
    const api = {
        consentstring: '',
        gdprApplies: true,
        regulation: 1,
        regulationKey: 'GDPR',
        cmpId: 31,
        purposes: [],
        vendors: [],
        customPurposes: [],
        customVendors: [],
        getCMPData: cmpData,
        getConsentData: cmpData,
        getPurposeConsent: noopfalsefn,
        getVendorConsent: noopfalsefn,
        getCustomPurposeConsent: noopfalsefn,
        getCustomVendorConsent: noopfalsefn,
        getUSPrivacyString: ( ) => '1YYN',
        getConsentString: noopstrfn,
        hasConsent: noopfalsefn,
        hasPurposeConsent: noopfalsefn,
        hasVendorConsent: noopfalsefn,
        getPurposes: nooparrayfn,
        getVendors: nooparrayfn,
        // Their own display and decision entry points. There is no banner,
        // and the answer is already no.
        showUI: noopfn,
        hideUI: noopfn,
        openScreen: noopfn,
        closeScreen: noopfn,
        setConsent: noopfn,
        acceptAll: noopfn,
        rejectAll: noopfn,
        saveConsent: noopfn,
        reloadConsent: noopfn,
        log: noopfn,
        // Their reporting, kept inert: theirs posts to Microsoft Clarity,
        // Microsoft UET and Xandr, and pushes a data layer event.
        sendMicrosoftClarityTracking: noopfn,
        sendMicrosoftUETTracking: noopfn,
        sendXandrTracking: noopfn,
        sendWordpressTracking: noopfn,
        sendDataLayerEvent: noopfn,
        // Their cross-domain sharing, which posts into a __cmpcdframe.
        writeStore: noopfn,
        readStore: noopstrfn,
        consentRR: { name: NAME, version: VERSION, mode: mode },
    };

    const out = standing !== null ? standing : {};
    for ( const key of Object.keys(api) ) { out[key] = api[key]; }
    w.cmpmngr = out;

    try {
        w.__cmp = cmp;
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

    revive();

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
