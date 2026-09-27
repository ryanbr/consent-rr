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

    Shared implementation for onetrust-accept.js / onetrust-reject.js.

    The globals, cookie fields, class names and event names below were read off
    OneTrust's own otSDKStub.js and otBannerSdk.js so that page code cannot
    tell the difference. No OneTrust code is reproduced here.

*/

function consentRROneTrust(mode, installTcf, installGpp) {
    const w = window;
    const doc = w.document;
    // What the page is told, and whether parked tags are let go, are two
    // separate things. reject-unblock refuses exactly as reject does, and still
    // un-parks everything: un-parking a tag is mechanical, it claims no consent,
    // and uBlock Origin still blocks whatever the tag then asks for.
    const accept = mode === 'accept';
    const reviveAll = accept || mode === 'reject-unblock';
    // Substituted from package.json by tools/build.mjs.
    const VERSION = '@@VERSION@@';
    const NAME = 'onetrust-' + (accept ? 'accept' : mode);

    // A site can preset window.OneTrust (geolocationResponse, for one) before
    // the SDK loads, and the SDK assigns over whatever is there rather than
    // replacing it. Bail out when a consent-rr stub is already installed, i.e.
    // when two requests in the same document were both redirected here.
    const preset = typeof w.OneTrust === 'object' && w.OneTrust !== null
        ? w.OneTrust
        : null;
    if ( preset !== null && preset.consentRR !== undefined ) { return; }

    // https://developer.onetrust.com/onetrust/docs/javascript-api
    // Bound, as uBO's own resources do it, so that a stubbed method reports
    // itself as native code.
    const noopfn = function() {
    }.bind();
    const noopstrfn = function() {
        return '';
    }.bind();
    const nooptruefn = function() {
        return true;
    }.bind();

    // C0001 strictly necessary, C0002 performance, C0003 functional,
    // C0004 targeting, C0005 social media. Sites can add their own ids, so
    // the set is extended with whatever the document turns out to reference.
    const alwaysActive = 'C0001';
    // V2STACK42 is the IAB stack group, present in every IAB-enabled tenant
    // sampled, and sites do read it by name.
    const groupIds = new Set([
        'C0001', 'C0002', 'C0003', 'C0004', 'C0005', 'V2STACK42',
    ]);

    // Gated tags are tagged optanon-category-C0002, optanon-category-C0002-C0004
    // or ot-vscat-<id> (vendor service categories). Mirrors the SDK's matcher,
    // which accepts alphanumerics and commas only.
    const reCategoryClass = /(?:optanon-category|ot-vscat)((?:-[a-zA-Z0-9,]+)+)/;
    const categorySelector = '[class*="optanon-category"],[class*="ot-vscat"]';

    const collectGroupIds = nodes => {
        for ( const node of nodes ) {
            const match = reCategoryClass.exec(node.getAttribute('class') || '');
            if ( match === null ) { continue; }
            for ( const id of match[1].split(/[-,]/) ) {
                if ( id !== '' ) { groupIds.add(id); }
            }
        }
    };

    const consentedIds = ( ) => accept
        ? Array.from(groupIds)
        : [ alwaysActive ];

    /**************************************************************************/

    // otSDKStub.js publishes ",<id>,<id>," under both names.
    const setGlobals = ( ) => {
        const active = ',' + consentedIds().join(',') + ',';
        w.OnetrustActiveGroups = active;
        w.OptanonActiveGroups = active;
        return active;
    };

    // ... and seeds the data layer with its own two load events, creating the
    // array when the page has not done so yet.
    const pushDataLayer = active => {
        const events = [
            { event: 'OneTrustLoaded', OnetrustActiveGroups: active },
            { event: 'OptanonLoaded', OptanonActiveGroups: active },
        ];
        const dl = w.dataLayer;
        if ( dl === undefined ) {
            w.dataLayer = events;
            return;
        }
        if ( Array.isArray(dl) === false ) { return; }
        for ( const event of events ) {
            try {
                dl.push(event);
            } catch(ex) {
            }
        }
    };

    /**************************************************************************/

    const pushGroupsUpdated = active => {
        if ( Array.isArray(w.dataLayer) === false ) { return; }
        try {
            w.dataLayer.push({
                event: 'OneTrustGroupsUpdated',
                OnetrustActiveGroups: active,
            });
        } catch(ex) {
        }
    };

    const readCookie = name => {
        for ( const cookie of String(doc.cookie).split(';') ) {
            const pos = cookie.indexOf('=');
            if ( pos === -1 ) { continue; }
            if ( cookie.slice(0, pos).trim() !== name ) { continue; }
            return cookie.slice(pos + 1).trim();
        }
        return '';
    };

    // The SDK scopes its cookies to the registered domain. A host-only copy
    // does not replace one of those, it shadows it - leaving two OptanonConsent
    // cookies, and code that takes the first match reads whichever is older.
    // There is no public suffix list in a page, so find the broadest domain the
    // browser will accept: setting a cookie on a public suffix fails silently.
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

    const writeCookie = (name, value) => {
        if ( cookieDomain === undefined ) {
            try {
                cookieDomain = findCookieDomain();
            } catch(ex) {
                cookieDomain = '';
            }
        }
        const attributes = '; path=/; max-age=31536000; samesite=lax';
        try {
            // Clear a host-only copy first, whoever wrote it, so the one that
            // remains is the one the SDK's own scope would have used.
            if ( cookieDomain !== '' ) {
                doc.cookie = name + '=; path=/; max-age=0';
                doc.cookie =
                    name + '=' + value + attributes + '; domain=' + cookieDomain;
                return;
            }
            doc.cookie = name + '=' + value + attributes;
        } catch(ex) {
        }
    };

    const randomConsentId = ( ) => {
        try {
            if ( typeof crypto.randomUUID === 'function' ) {
                return crypto.randomUUID();
            }
        } catch(ex) {
        }
        let out = '';
        for ( let i = 0; i < 36; i++ ) {
            out += i === 8 || i === 13 || i === 18 || i === 23
                ? '-'
                : Math.floor(Math.random() * 16).toString(16);
        }
        return out;
    };

    // OptanonConsent holds the decision, OptanonAlertBoxClosed suppresses the
    // banner. intType 1 is the SDK's "Banner - Allow All", 2 its
    // "Banner - Reject All". An existing consentId is kept so that a site does
    // not see a new visitor on every page load.
    const writeConsentCookies = ( ) => {
        const previous = new URLSearchParams(readCookie('OptanonConsent'));
        const consented = new Set(consentedIds());
        const groups = [];
        for ( const id of groupIds ) {
            groups.push(id + ':' + (consented.has(id) ? '1' : '0'));
        }
        const now = new Date();
        const gpc = w.navigator.globalPrivacyControl === true ? '1' : '0';
        const params = new URLSearchParams();
        params.set('isGpcEnabled', accept ? '0' : gpc);
        params.set('datestamp', now.toString());
        params.set('version', previous.get('version') || '202501.1.0');
        params.set('browserGpcFlag', gpc);
        params.set('isIABGlobal', 'false');
        params.set('hosts', '');
        params.set('genVendors', '');
        params.set('consentId', previous.get('consentId') || randomConsentId());
        params.set('interactionCount', '1');
        params.set('isAnonUser', '1');
        params.set('prevHadToken', '0');
        params.set('landingPath', 'NotLandingPage');
        params.set('groups', groups.join(','));
        params.set('AwaitingReconsent', 'false');
        params.set('intType', accept ? '1' : '2');
        // crTime is the SDK's LAST_CONSENT_RECEIPT, written where a tenant logs
        // receipts. Nothing was sent anywhere, so this is only the moment the
        // decision was recorded, same as datestamp.
        params.set('crTime', String(now.getTime()));
        // URLSearchParams escapes the parentheses in a timezone name and the
        // SDK does not, so put them back.
        writeCookie('OptanonConsent', params.toString()
            .replace(/%28/g, '(').replace(/%29/g, ')'));
        writeCookie('OptanonAlertBoxClosed', now.toISOString());
        // Google's Additional Consent string: version, the consented ids, then
        // the disclosed ones. Both lists are empty here - a refusal consents to
        // no AC vendor either, and the several hundred ids a real string carries
        // are Google's own global list, not anything derivable from the page.
        writeCookie('OTAdditionalConsentString', '2~~dv');
    };

    // Sites commonly keep their own record of the choice beside OneTrust's and
    // re-prompt until it is set. cookieChoiceMade is the cookiechoices.js
    // convention; OneTrust itself never touches it. The key records that a
    // choice was made, not which way it went, so both resources set it.
    const siteChoiceKeys = [ 'cookieChoiceMade' ];

    // Called more than once on purpose: a page that clears storage while
    // booting, or writes its own value over ours, would otherwise win. Storage
    // throws outright when it is blocked, and a page that re-prompts is a far
    // smaller problem than a stub that died half installed.
    const writeSiteChoice = ( ) => {
        for ( const key of siteChoiceKeys ) {
            try {
                const storage = w.localStorage;
                if ( storage.getItem(key) === 'true' ) { continue; }
                storage.setItem(key, 'true');
            } catch(ex) {
            }
        }
    };

    /**************************************************************************/

    // The banner can be server-rendered, and OtAutoBlock.js can have put the
    // overlay in place before this stub runs.
    const bannerSelector = [
        '#onetrust-consent-sdk',
        '#onetrust-banner-sdk',
        '#onetrust-pc-sdk',
        '.onetrust-pc-dark-filter',
        '#ot-sdk-btn-floating',
    ].join(',');

    // Matched in one pass, and against the root itself as well, since a scan of
    // an added subtree is handed the added node.
    const matching = (root, selector) => {
        const out = [];
        if ( typeof root.matches === 'function' && root.matches(selector) ) {
            out.push(root);
        }
        for ( const node of root.querySelectorAll(selector) ) { out.push(node); }
        return out;
    };

    const removeBanner = root => {
        for ( const node of matching(root, bannerSelector) ) { node.remove(); }
    };

    /**************************************************************************/

    // Both halves of the SDK's substitutePlainTextScriptTags(): a tag carrying
    // data-src gets its src back, a script parked at type="text/plain" is
    // replaced by a live copy of itself.
    const reactivateSrcTag = node => {
        const src = node.getAttribute('data-src');
        if ( src === null ) { return; }
        node.setAttribute('src', src);
        node.removeAttribute('data-src');
    };

    const reactivateScriptTag = node => {
        const parent = node.parentNode;
        if ( parent === null ) { return; }
        const clone = doc.createElement(node.tagName);
        clone.textContent = node.textContent;
        for ( const attr of node.attributes ) {
            try {
                clone.setAttribute(
                    attr.name,
                    attr.name === 'type' ? 'text/javascript' : attr.value
                );
            } catch(ex) {
            }
        }
        parent.appendChild(clone);
        parent.removeChild(node);
    };

    // reactivateTag() asks canInsertForGroup() about each tag's own categories,
    // so a tag gated on nothing but C0001 is revived even by a reject-all. Only
    // the categories decide, never the mode.
    const mayRevive = (node, consented) => {
        if ( reviveAll ) { return true; }
        const match = reCategoryClass.exec(node.getAttribute('class') || '');
        if ( match === null ) { return false; }
        const ids = match[1].split(/[-,]/).filter(id => id !== '');
        if ( ids.length === 0 ) { return false; }
        return ids.every(id => consented.has(id));
    };

    // Two passes over one list, keeping the SDK's order - tags carrying data-src
    // first, then scripts parked at text/plain.
    const activateGatedTags = nodes => {
        const consented = new Set(consentedIds());
        for ( const node of nodes ) {
            if ( node.tagName === 'SCRIPT' ) { continue; }
            if ( node.hasAttribute('data-src') === false ) { continue; }
            if ( mayRevive(node, consented) === false ) { continue; }
            reactivateSrcTag(node);
        }
        for ( const node of nodes ) {
            if ( node.tagName !== 'SCRIPT' ) { continue; }
            if ( node.getAttribute('type') !== 'text/plain' ) { continue; }
            if ( mayRevive(node, consented) === false ) { continue; }
            reactivateScriptTag(node);
        }
    };

    /**************************************************************************/

    let scanTimer;

    const scan = (root = doc) => {
        const nodes = matching(root, categorySelector);
        collectGroupIds(nodes);
        const active = setGlobals();
        removeBanner(root);
        activateGatedTags(nodes);
        return active;
    };

    // The document can bite: a tag that will not be replaced, a page that has
    // tampered with querySelectorAll. None of that may cost the page its
    // consent state, so every scan is fenced off and whatever this one missed is
    // picked up by the next.
    const safeScan = root => {
        try {
            return scan(root);
        } catch(ex) {
        }
        return setGlobals();
    };

    // Gated tags and the banner markup arrive as the document is parsed, and
    // single-page apps keep adding them after that, so the observer stays. It
    // looks only at what was added: a document-wide pass costs the same whether
    // one node changed or none did, and on a busy page it would run all day.
    let pendingRoots;

    const flushScan = ( ) => {
        scanTimer = undefined;
        const roots = pendingRoots;
        pendingRoots = undefined;
        if ( roots === undefined ) {
            safeScan();
            return;
        }
        for ( const root of roots ) { safeScan(root); }
    };

    const scanDeferred = records => {
        if ( Array.isArray(records) ) {
            for ( const record of records ) {
                for ( const node of record.addedNodes ) {
                    if ( node.nodeType !== 1 ) { continue; }
                    if ( pendingRoots === undefined ) { pendingRoots = new Set(); }
                    pendingRoots.add(node);
                }
            }
            if ( pendingRoots === undefined ) { return; }
        }
        if ( scanTimer !== undefined ) { return; }
        scanTimer = w.setTimeout(flushScan, 100);
    };

    /**************************************************************************/

    const domainData = ( ) => {
        const consented = new Set(consentedIds());
        return {
            ShowAlertNotice: false,
            IsIabEnabled: false,
            Groups: Array.from(groupIds).map(id => ({
                CustomGroupId: id,
                GroupId: id,
                GroupName: id,
                Parent: '',
                Status: id === alwaysActive
                    ? 'always active'
                    : consented.has(id) ? 'active' : 'inactive',
                IsIabPurpose: false,
                Cookies: [],
                FirstPartyCookies: [],
                Hosts: [],
                SubGroups: [],
            })),
        };
    };

    // Mirrors canInsertForGroup(): a tag goes in when every category it names
    // is consented, and options.ignoreGroupCheck skips the check outright. A
    // call naming no category has nothing to check, so it follows the mode.
    const mayInsert = (groupId, options) => {
        if ( typeof options === 'object' && options !== null &&
            options.ignoreGroupCheck === true )
        {
            return true;
        }
        const requested = Array.isArray(groupId)
            ? groupId.map(String)
            : String(groupId === undefined || groupId === null ? '' : groupId)
                .split(',')
                .map(id => id.trim())
                .filter(id => id !== '');
        if ( reviveAll ) { return true; }
        if ( requested.length === 0 ) { return false; }
        const consented = new Set(consentedIds());
        return requested.every(id => consented.has(id));
    };

    const querySelector = selector => {
        if ( typeof selector !== 'string' || selector === '' ) { return null; }
        try {
            return doc.querySelector(selector);
        } catch(ex) {
        }
        return null;
    };

    const insertScript = (url, selector, callback, options, groupId, isAsync) => {
        if ( mayInsert(groupId, options) === false ) { return; }
        if ( typeof url !== 'string' || url === '' ) { return; }
        const target = querySelector(selector) ||
            doc.body || doc.head || doc.documentElement;
        if ( target === null ) { return; }
        const script = doc.createElement('script');
        if ( typeof callback === 'function' ) {
            script.addEventListener('load', callback, { once: true });
        }
        if ( isAsync === true ) { script.async = true; }
        script.src = url;
        target.appendChild(script);
    };

    const insertHtml = (content, selector, callback, options, groupId) => {
        if ( mayInsert(groupId, options) === false ) { return; }
        const target = querySelector(selector);
        if ( target === null ) { return; }
        if ( typeof options === 'object' && options !== null &&
            options.deleteSelectorContent === true )
        {
            target.textContent = '';
        }
        if ( content instanceof w.Node ) {
            target.appendChild(content);
        } else if ( typeof content === 'string' && content !== '' ) {
            try {
                target.insertAdjacentHTML('beforeend', content);
            } catch(ex) {
                return;
            }
        }
        if ( typeof callback === 'function' ) {
            try {
                callback();
            } catch(ex) {
            }
        }
    };

    // The SDK's OnConsentChanged() is a deduplicated window listener for
    // "consent.onetrust". Consent never changes here, so nothing dispatches it
    // - same as a return visit whose choice is already stored.
    const consentChangedSeen = new Set();

    const onConsentChanged = callback => {
        if ( typeof callback !== 'function' ) { return; }
        const key = callback.toString();
        if ( consentChangedSeen.has(key) ) { return; }
        consentChangedSeen.add(key);
        w.addEventListener('consent.onetrust', callback);
    };

    const api = {
        consentRR: { mode, version: VERSION },
        // There is no banner and no preference centre to drive.
        Init: noopfn,
        InitializeBanner: noopfn,
        LoadBanner: noopfn,
        Close: noopfn,
        ToggleInfoDisplay: noopfn,
        FetchAndDownloadPC: noopfn,
        initializeCookiePolicyHtml: noopfn,
        getCSS: noopstrfn,
        getHTML: noopstrfn,
        // The decision is fixed by which resource the filter redirected to.
        AllowAll: noopfn,
        RejectAll: noopfn,
        UpdateConsent: noopfn,
        ReconsentGroups: noopfn,
        SetAlertBoxClosed: noopfn,
        IsAlertBoxClosed: nooptruefn,
        IsAlertBoxClosedAndValid: nooptruefn,
        IsVendorServiceEnabled: ( ) => false,
        GetDomainData: domainData,
        OnConsentChanged: onConsentChanged,
        InsertScript: insertScript,
        InsertHtml: insertHtml,
        // The SDK ships InsertHtml; the public docs call it InsertHTML.
        InsertHTML: insertHtml,
        // No location is claimed: an empty answer keeps a site from branching
        // on a region this stub made up.
        getGeolocationData: ( ) => ({ country: '', state: '' }),
        setGeoLocation: noopfn,
        // The SDK's own default is true.
        useGeoLocationService: true,
        changeLanguage: noopfn,
        getDataSubjectId: noopstrfn,
        getDSDefaultIdentifier: noopstrfn,
        setDataSubjectId: noopfn,
        syncConsentProfile: noopfn,
        setConsentProfile: noopfn,
        SendReceipt: noopfn,
        BlockGoogleAnalytics: noopfn,
        TriggerGoogleAnalyticsEvent: noopfn,
        UpdateGCM: noopfn,
        getVendorConsentsRequestV2: noopfn,
        testLog: noopfn,
        Api: { TriggerReceiptAction: noopfn },
    };

    /**************************************************************************/

    let wrapperDone = false;

    // Called as a property of window, exactly as the SDK does, so that a
    // wrapper reading "this" still sees the window.
    const executeOptanonWrapper = ( ) => {
        if ( wrapperDone ) { return; }
        if ( typeof w.OptanonWrapper !== 'function' ) { return; }
        wrapperDone = true;
        try {
            w.OptanonWrapper();
        } catch(ex) {
        }
    };

    const dispatchGroupsUpdated = ( ) => {
        let event;
        try {
            event = new CustomEvent('OneTrustGroupsUpdated', {
                detail: consentedIds(),
            });
        } catch(ex) {
            return;
        }
        w.dispatchEvent(event);
    };

    const onReady = ( ) => {
        writeSiteChoice();
        const active = safeScan();
        executeOptanonWrapper();
        pushGroupsUpdated(active);
        dispatchGroupsUpdated();
        if ( wrapperDone ) { return; }
        // OptanonWrapper is often declared later than the SDK tag - a deferred
        // bundle, or an inline script further down the page.
        let tries = 0;
        const timer = w.setInterval(( ) => {
            executeOptanonWrapper();
            tries += 1;
            if ( wrapperDone === false && tries < 20 ) { return; }
            w.clearInterval(timer);
        }, 250);
    };

    /**************************************************************************/

    w.OneTrust = w.Optanon = Object.assign({}, preset, api);

    // Independent of each other by design: whichever of these a page manages to
    // break, the rest still land. The site's own key goes first, being the
    // cheapest and the one a page is most likely to re-check later.
    writeSiteChoice();
    const active = safeScan();
    try {
        writeConsentCookies();
    } catch(ex) {
    }

    // The IAB layers, for a resource that carries them. eupubconsent-v2 is the
    // cookie OneTrust keeps the publisher TC string in; the GPP string is not
    // stored in one.
    if ( typeof installTcf === 'function' ) {
        const tcString = installTcf(accept);
        if ( typeof tcString === 'string' && tcString !== '' ) {
            writeCookie('eupubconsent-v2', tcString);
        }
    }
    if ( typeof installGpp === 'function' ) {
        installGpp(accept);
    }

    pushDataLayer(active);

    try {
        new MutationObserver(scanDeferred).observe(doc.documentElement || doc, {
            childList: true,
            subtree: true,
        });
    } catch(ex) {
    }

    if ( doc.readyState === 'loading' ) {
        doc.addEventListener('DOMContentLoaded', onReady, { once: true });
    } else {
        w.setTimeout(onReady, 0);
    }

    // Last word, after anything the page does while loading.
    if ( doc.readyState !== 'complete' ) {
        w.addEventListener('load', writeSiteChoice, { once: true });
    }

    // Said once, at the end, so it reports what actually went in. A page is
    // free to have removed the console.
    if ( typeof console === 'object' && typeof console.info === 'function' ) {
        console.info(
            '[consent-rr] ' + NAME + ' ' + VERSION +
            ' groups=' + active +
            (typeof installTcf === 'function'
                ? ' tcf=' + (accept ? 'granted' : 'refused')
                : '') +
            (typeof installGpp === 'function'
                ? ' gpp=' + (accept ? 'granted' : 'refused')
                : '')
        );
    }
}
