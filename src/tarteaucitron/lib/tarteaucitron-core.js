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

    Shared implementation for tarteaucitron-reject.js and
    tarteaucitron-reject-unblock.js.

    tarteaucitron, which is both an open-source CMP a site hosts itself and a
    paid service at tarteaucitron.io. It is everywhere on French public-sector
    and media sites.

    TWO DEPLOYMENTS, AND THEY HAND OVER DIFFERENT THINGS. Measured on
    cdntag.tarteaucitron.io/load.js?domain=...&uuid=... (1.35.0) and on a
    self-hosted build, info.gouv.fr/build/tarteaucitron.<hash>.js:

      the hosted loader is one 95KB file with the site's configuration AND its
      service list inlined - tarteaucitron.init({36 keys}) and
      tarteaucitron.job=["twitterembed"] are in the file itself. Replacing it
      takes both with it, so this resource cannot read them and works from
      their own defaults instead.

      the self-hosted build inlines neither: the PAGE calls
      tarteaucitron.init({...}) and pushes its own services afterwards. Both
      arrive after this resource has loaded, so init() merges what it is given
      the way theirs does - page values win over defaults, by hasOwnProperty -
      and job.push is live, which is also what theirs does: their own build
      replaces job.push after init.

    THEIR RECORD is one cookie, named by parameters.cookieName and defaulting
    to tarteaucitron, holding an entry per service:

        tarteaucitron=!twitterembed=false!youtube=false

    with each status one of wait, true or false - measured by driving their own
    Deny All, which leaves exactly that and tarteaucitron.state
    {twitterembed: false}. Their writer rewrites one entry at a time:

        regex = new RegExp("!" + key + "=(wait|true|false)", "g");
        cookie = tarteaucitron.cookie.read().replace(regex, "");
        value = parameters.cookieName + "=" + cookie + "!" + key + "=" + status;

    THE EVENTS GO TO THE DOCUMENT, not the window: their sendEvent builds a
    plain Event and calls document.dispatchEvent. Per service they fire
    <key>_consentModeKo on a refusal and <key>_consentModeOk on a grant, and
    those are not decoration - their own Google, Bing and Clarity glue listens
    for them:

        document.addEventListener("bingads_consentModeKo", function() {
            window.uetq.push("consent", "update", {ad_storage: "denied"});
        }, {once: true});

    so firing the Ko events is how a refusal reaches the consent-mode layer.

    NOT DONE HERE, deliberately:

      no banner          nothing is built, so there is nothing to style and no
                         external CSS to fetch.
      no reload          their respondAll sets tarteaucitron.reloadThePage when
                         a refusal revokes a service that had already launched.
                         Nothing launches here, so there is nothing to undo and
                         the page is left alone.
      no pro() beacon    theirs accumulates a status string and posts it to
                         logs.tarteaucitron.io/collect with the site's uuid and
                         domain, through sendBeacon. It is a report of the
                         visitor's choice to a third party, which is most of
                         the reason to replace the file.
      no accept-all      A grant for an ad or analytics service would be a
                         grant, and this repo's accept resources exist for
                         walls that withhold content. Nothing here withholds
                         anything: the reject-unblock variant below covers the
                         one thing a refusal costs a reader.

    REJECT-UNBLOCK CONSENTS TO VIDEO AND SOCIAL, AND REFUSES THE REST, which
    their own model makes a clean cut rather than a guess: every service in
    their bundle carries a type, and their own respondAll takes a type to act
    on. Measured over the 247 in 1.35.0:

        analytic 67   ads 51   api 29   video 26   support 23
        other 22      social 21   google 6   comment 2

    so video and social are consented and launched, and ads, analytic, google,
    api, support, other and comment are refused. comment is disqus and
    facebookcomment, which are a tracker wearing a comment box; api is maps
    and captchas, which is the next thing worth arguing about.

    HOW IT LAUNCHES ONE, which is the part that cannot be faked: a service's
    launcher is tarteaucitron.services[key].js(), and it builds its embed
    through this file's own functions -

        js: function() {
            tarteaucitron.fallback(["youtube_player"], function(x) {
                var video_id = tarteaucitron.getElemAttr(x, "videoID"), ...
            });
        }

    - so fallback, getElemAttr, getStyleSize and addScript are implemented for
    real here rather than stubbed, and their own launchers run against them.

    The registry those launchers live in is their services bundle. Where the
    page loaded it itself, it is adopted. Where it did not - the hosted loader
    fetches it from their CDN, with addInternalScript(pathToServices) - the
    unblock variant fetches that one file, which is the request the replaced
    file would have made anyway, and nothing else. A service whose type is not
    yet known is refused in the meantime, so a bundle that never arrives
    leaves everything refused rather than everything open.

*/

function consentRRTarteaucitron(mode) {
    const w = window;
    const doc = w.document;
    // Substituted from package.json by tools/build.mjs.
    const VERSION = '@@VERSION@@';
    const NAME = 'tarteaucitron-' + mode;
    // Their own type vocabulary, and the cut this makes in it.
    const ALLOWED = mode === 'reject-unblock' ? [ 'video', 'social' ] : [];
    // And the exception to it, which exists because TWO OF THEIR OWN BUNDLES
    // DISAGREE. info.gouv.fr's self-hosted build types acast as "other", and
    // their CDN's tarteaucitron.services.min.js at 1.35.0 types the same key
    // "video" - so a reader's record from that page refuses acast, while the
    // registry this resource falls back to would have allowed it. Replacing a
    // site's build takes its typings with it, so the fallback must not end up
    // more permissive than the deployment it replaced. Acast is podcast
    // advertising and measurement either way. One name, named, with the
    // disagreement written down.
    const REFUSED_ANYWAY = [ 'acast' ];
    const BUNDLE = 'https://cdn.tarteaucitron.io/tarteaucitron.services.min.js';

    const standing = typeof w.tarteaucitron === 'object' && w.tarteaucitron !== null
        ? w.tarteaucitron
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

    // Their init defaults, from the object their own init merges in where the
    // page has not set a key. The hosted loader carries a site's answers to
    // these inside the file this replaces, so on that deployment these are
    // what is left - and cookieName, the only one that decides where the
    // record goes, is the same in both.
    const DEFAULTS = {
        adblocker: false,
        hashtag: '#tarteaucitron',
        cookieName: 'tarteaucitron',
        highPrivacy: true,
        orientation: 'middle',
        bodyPosition: 'bottom',
        removeCredit: false,
        showAlertSmall: false,
        showDetailsOnClick: true,
        showIcon: true,
        iconPosition: 'BottomRight',
        cookieslist: false,
        handleBrowserDNTRequest: false,
        DenyAllCta: true,
        AcceptAllCta: true,
        moreInfoLink: true,
        privacyUrl: '',
        useExternalCss: false,
        useExternalJs: false,
        mandatory: true,
        mandatoryCta: true,
        closePopup: false,
        groupServices: false,
        serviceDefaultState: 'wait',
    };

    const parameters = standing !== null &&
        typeof standing.parameters === 'object' && standing.parameters !== null
        ? standing.parameters
        : {};
    for ( const key of Object.keys(DEFAULTS) ) {
        if ( Object.prototype.hasOwnProperty.call(parameters, key) === false ) {
            parameters[key] = DEFAULTS[key];
        }
    }

    const cookieName = ( ) => String(parameters.cookieName || 'tarteaucitron');

    /**************************************************************************/

    // Their reader, which is a plain prefix match on document.cookie and
    // answers the empty string when nothing is stored.
    const readCookie = ( ) => {
        const prefix = cookieName() + '=';
        for ( const pair of String(doc.cookie || '').split(';') ) {
            let text = pair;
            while ( text.charAt(0) === ' ' ) { text = text.substring(1); }
            if ( text.indexOf(prefix) === 0 ) {
                return text.substring(prefix.length);
            }
        }
        return '';
    };

    // Their writer, entry by entry, including the rewrite of one that is
    // already there. Their expiry is parameters.expireindays where a tenant
    // sets one - the hosted loader said 365, which is also their own ceiling.
    // Their expiry, which is two page-settable globals rather than a
    // parameter: tarteaucitronForceExpire counted in days when
    // tarteaucitronExpireInDay is true and in hours when it is false, and
    // only honoured below their own ceilings of 365 days and 8760 hours.
    // The hosted loader sets both inside the file being replaced, so there
    // they are gone and the ceiling is what is left.
    const lifetime = ( ) => {
        const DAY = 86400000;
        let inDays = true;
        try {
            if ( typeof w.tarteaucitronExpireInDay === 'boolean' ) {
                inDays = w.tarteaucitronExpireInDay;
            }
        } catch ( ex ) {
        }
        let forced = NaN;
        try {
            forced = Number(w.tarteaucitronForceExpire);
        } catch ( ex ) {
        }
        if ( Number.isFinite(forced) === false || forced <= 0 ) {
            const named = Number(parameters.expireindays);
            if ( Number.isFinite(named) && named > 0 && named < 365 ) {
                return named * DAY;
            }
            return 365 * DAY;
        }
        if ( inDays && forced < 365 ) { return forced * DAY; }
        if ( inDays === false && forced < 8760 ) { return forced * 3600000; }
        return 365 * DAY;
    };

    let wrote = 0;
    const writeCookie = (key, status) => {
        const regex = new RegExp('!' + key + '=(wait|true|false)', 'g');
        const kept = readCookie().replace(regex, '');
        const value = cookieName() + '=' + kept + '!' + key + '=' + status;
        const domain = typeof parameters.cookieDomain === 'string' &&
            parameters.cookieDomain !== ''
            ? '; domain=' + parameters.cookieDomain
            : '';
        try {
            doc.cookie = value + '; expires=' +
                new Date(Date.now() + lifetime()).toUTCString() +
                '; path=/' + domain;
            wrote += 1;
        } catch ( ex ) {
        }
    };

    /**************************************************************************/

    // Their dispatcher: a plain Event at the DOCUMENT. Their own consent-mode
    // glue listens there, so a refusal that skipped this would not reach it.
    let events = 0;
    const sendEvent = name => {
        if ( name === undefined ) { return; }
        try {
            let item;
            if ( typeof w.Event === 'function' ) {
                item = new w.Event(String(name));
            } else {
                item = doc.createEvent('Event');
                item.initEvent(String(name), true, true);
            }
            doc.dispatchEvent(item);
            events += 1;
        } catch ( ex ) {
        }
    };

    // Their consent-mode defaults, as the hosted loader pushes them: denied,
    // with their own wait_for_update. Theirs then moves on the per-service
    // events, which are fired below.
    const DENIED = {
        ad_storage: 'denied',
        analytics_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
    };
    const consentMode = ( ) => {
        if ( parameters.googleConsentMode === false ) { return; }
        try {
            w.dataLayer = w.dataLayer || [];
            // The shape matters and was measured: theirs pushes an ARGUMENTS
            // object, not an array - Object.keys "0","1","2" - which is what
            // gtag('consent', ...) leaves behind and what Tag Manager reads a
            // consent command out of. An array looks the same under indexing
            // and is not the same thing, so a denial pushed as one can be
            // passed over. Their own code defines no window.gtag, so neither
            // does this.
            const gtag = function() {
                w.dataLayer.push(arguments);
            };
            const first = {};
            for ( const key of Object.keys(DENIED) ) { first[key] = DENIED[key]; }
            first.wait_for_update = 800;
            gtag('consent', 'default', first);
            gtag('consent', 'update', DENIED);
        } catch ( ex ) {
        }
        try {
            w.uetq = w.uetq || [];
            w.uetq.push('consent', 'default', { ad_storage: 'denied' });
            w.uetq.push('consent', 'update', { ad_storage: 'denied' });
        } catch ( ex ) {
        }
    };

    /**************************************************************************/

    // Their own element reader, which a launcher uses for every attribute it
    // builds an embed from: data-<name> first, then <name>, and a url that is
    // not a url is refused rather than written into a src.
    const getElemAttr = (elem, attr) => {
        try {
            const name = String(attr);
            let value = elem.getAttribute('data-' + name);
            if ( value === null ) { value = elem.getAttribute(name); }
            if ( value === null && name.indexOf('data-') === 0 ) {
                value = elem.getAttribute(name.slice(5));
            }
            if ( value === null ) { return ''; }
            if ( name === 'url' || name === 'data-url' || name === 'data-src' ) {
                if ( /^https?:\/\/[^\s]+$/.test(value) === false ) { return ''; }
            }
            return value;
        } catch ( ex ) {
        }
        return '';
    };

    // Their size reader: a bare number becomes pixels, a unit is kept, and
    // nothing becomes auto.
    const UNITS = /^[0-9]+(\.[0-9]+)?(px|%|em|rem|vh|vw|vmin|vmax|ch|ex|pt|pc|cm|mm|in|q)$/i;
    const getStyleSize = value => {
        if ( value === null || value === undefined ) { return 'auto'; }
        const text = String(value).trim();
        if ( text === '' ) { return 'auto'; }
        if ( UNITS.test(text) ) { return text; }
        if ( /^[0-9]+(\.[0-9]+)?$/.test(text) ) { return text + 'px'; }
        return 'auto';
    };

    // Their own fallback, which is how every launcher reaches its elements.
    // Implemented rather than stubbed, because a stub here means an embed that
    // is consented to and still does not appear.
    const fallback = (matchClass, content, noInner) => {
        if ( Array.isArray(matchClass) === false ) { return; }
        const selector = matchClass.map(name => '.' + name).join(', ');
        let elems = [];
        try {
            elems = doc.querySelectorAll(selector);
        } catch ( ex ) {
            return;
        }
        for ( const elem of elems ) {
            const width = getElemAttr(elem, 'width');
            const height = getElemAttr(elem, 'height');
            if ( width !== '' ) { elem.style.width = getStyleSize(width); }
            if ( height !== '' ) { elem.style.height = getStyleSize(height); }
            if ( typeof content === 'function' ) {
                if ( noInner === true ) {
                    content(elem);
                } else {
                    elem.innerHTML = content(elem);
                }
            } else {
                elem.innerHTML = content;
            }
        }
    };

    // Their script loader. A launcher that pulls a platform's own widget code
    // goes through this, and uBlock Origin decides what it is allowed to
    // fetch - as it would have either way.
    let fetched = 0;
    const addScript = (url, id, callback, execute, attrName, attrVal) => {
        // Theirs reads execute === false as "do not load it, but call the
        // callback anyway", and a launcher uses that to run its own work
        // without a fetch. Dropping the callback there would leave an embed
        // that was consented to unbuilt.
        if ( execute === false ) {
            if ( typeof callback === 'function' ) {
                try {
                    callback();
                } catch ( ex ) {
                }
            }
            return;
        }
        if ( typeof url !== 'string' || url === '' ) { return; }
        try {
            const node = doc.createElement('script');
            node.async = true;
            node.src = url;
            if ( typeof id === 'string' && id !== '' ) { node.id = id; }
            if ( typeof attrName === 'string' && attrName !== '' ) {
                node.setAttribute(attrName, String(attrVal));
            }
            if ( typeof callback === 'function' ) {
                node.onload = callback;
            }
            const head = doc.getElementsByTagName('head')[0] ||
                doc.documentElement;
            if ( head !== null ) { head.appendChild(node); }
            fetched += 1;
        } catch ( ex ) {
        }
    };

    const state = standing !== null && typeof standing.state === 'object' &&
        standing.state !== null
        ? standing.state
        : {};
    const launch = {};
    const services = standing !== null && typeof standing.services === 'object' &&
        standing.services !== null
        ? standing.services
        : {};

    // A service a page declares that their services bundle would have defined.
    // Theirs is read for .key, .type and .name by code that walks the job list,
    // so an answer goes up rather than a hole - and never a .js() that would
    // launch anything.
    const describe = key => {
        if ( typeof services[key] === 'object' && services[key] !== null ) {
            return services[key];
        }
        services[key] = {
            key: key,
            // NOT a type. Inventing one here - 'other' was the first attempt -
            // makes this record indistinguishable from a real definition, so
            // a registry arriving later could never move the decision unless
            // it happened to assign over the top. Empty means not known, and
            // not known stays refused.
            type: '',
            name: key,
            needConsent: true,
            cookies: [],
            js: noopfn,
            fallback: noopfn,
        };
        return services[key];
    };

    const named = name => {
        const key = typeof name === 'string'
            ? name
            : (name !== null && typeof name === 'object' &&
                typeof name.key === 'string' ? name.key : '');
        if ( key === '' || /^[A-Za-z0-9_.-]+$/.test(key) === false ) { return ''; }
        return key;
    };

    // One service refused: the record, their state, and the event their own
    // consent-mode glue is listening for.
    let refused = 0;
    const refuse = name => {
        const key = named(name);
        if ( key === '' ) { return; }
        describe(key);
        if ( state[key] === false ) { return; }
        state[key] = false;
        launch[key] = false;
        writeCookie(key, 'false');
        sendEvent(key + '_consentModeKo');
        refused += 1;
    };

    // One service consented to and started, through its own launcher.
    let allowed = 0;
    let launched = 0;
    const allow = key => {
        if ( state[key] === true ) { return; }
        state[key] = true;
        launch[key] = true;
        writeCookie(key, 'true');
        sendEvent(key + '_consentModeOk');
        allowed += 1;
        const service = services[key];
        if ( service === undefined || typeof service.js !== 'function' ) {
            return;
        }
        try {
            service.js();
            launched += 1;
        } catch ( ex ) {
        }
    };

    // A service whose type is not known yet, because their registry has not
    // arrived. Refused in the meantime, and reconsidered when it does: a
    // bundle that never comes leaves everything refused.
    const pending = [];
    const typeOf = key => {
        const service = services[key];
        return service !== undefined && typeof service.type === 'string'
            ? service.type
            : '';
    };

    const decide = name => {
        const key = named(name);
        if ( key === '' ) { return; }
        if ( ALLOWED.length === 0 ) {
            refuse(key);
            return;
        }
        const type = typeOf(key);
        if ( type === '' ) {
            if ( pending.indexOf(key) === -1 ) { pending.push(key); }
            refuse(key);
            return;
        }
        if ( ALLOWED.indexOf(type) !== -1 &&
            REFUSED_ANYWAY.indexOf(key) === -1 ) {
            allow(key);
            return;
        }
        refuse(key);
    };

    // Their registry, from the same url their own loader builds - cdn, the
    // file, minified. Asked for once, and only where something is waiting on
    // it. Everything stays refused until it answers.
    let asked = false;
    const reconsider = ( ) => {
        for ( const key of pending.slice() ) {
            const type = typeOf(key);
            if ( type === '' ) { continue; }
            pending.splice(pending.indexOf(key), 1);
            if ( ALLOWED.indexOf(type) !== -1 ) { allow(key); }
        }
    };
    const fetchRegistry = ( ) => {
        // pending is only filled where a type was allowed to matter, so it is
        // empty under reject and no test can tell an ALLOWED check here from
        // this one. One condition, in one place.
        if ( asked || pending.length === 0 ) { return; }
        asked = true;
        addScript(BUNDLE, 'tarteaucitronServices', ( ) => { reconsider(); });
    };

    // Their job list, which is a live pushable in their own build too: theirs
    // replaces job.push after init so a service declared later is handled as
    // it arrives. Whatever is already in it is refused now.
    const job = Array.isArray(standing !== null ? standing.job : null)
        ? standing.job
        : [];
    const queued = job.slice();
    job.length = 0;
    job._push = Array.prototype.push;
    job.push = function() {
        for ( const name of arguments ) {
            job._push(name);
            decide(name);
        }
        fetchRegistry();
        return job.length;
    };

    /**************************************************************************/

    // Their text. No banner is built, so nothing here is shown - but their own
    // code reads lang.reload and the rest while labelling what it builds, and a
    // page can read any of about a hundred keys. An empty string for anything
    // asked for is an answer; a missing object is a throw.
    const lang = ( ) => {
        const strings = { close: '', reload: '', middleBarHead: '' };
        if ( typeof w.Proxy !== 'function' ) { return strings; }
        return new w.Proxy(strings, {
            get: (target, key) => {
                if ( typeof key !== 'string' ) { return target[key]; }
                // Reflect.has, not hasOwnProperty: answering '' for
                // toString or hasOwnProperty would hand a caller a string
                // where it called a function.
                if ( Reflect.has(target, key) ) { return target[key]; }
                return '';
            },
        });
    };

    const userInterface = {
        // Their own respondAll, which is what their Deny All button calls.
        // Granting is not on offer here: there is no service launcher to call,
        // so a yes could not be acted on.
        // Their own respondAll, which is what their buttons call, and which
        // takes a type to act on only - so a page asking for one gets that
        // one. What a type is answered with is this resource's decision, not
        // the caller's: a page cannot argue an ad service into a yes.
        respondAll: (status, type) => {
            for ( const name of job.slice() ) {
                const service = describe(name);
                if ( type !== undefined && type !== '' &&
                    service.type !== type ) {
                    continue;
                }
                decide(name);
            }
        },
        respond: noopfn,
        openPanel: noopfn,
        closePanel: noopfn,
        openAlert: noopfn,
        closeAlert: noopfn,
        toggle: noopfn,
        toggleCookiesList: noopfn,
        addClass: noopfn,
        removeClass: noopfn,
        color: noopfn,
        css: noopfn,
        order: noopfn,
        focusTrap: noopfn,
        jsSizing: noopfn,
        cleanUrl: noopstrfn,
        taclayoutPending: noopfn,
    };

    // Their own surface, by the names their 1.35.0 build carries. The ones a
    // page or their own glue calls answer; the rest are inert rather than
    // absent, because an absent one throws at the caller's own call site.
    const api = {
        version: VERSION,
        parameters: parameters,
        state: state,
        launch: launch,
        services: services,
        job: job,
        // The page's own service configuration - a launcher reads its ids and
        // handles out of here, so whatever is there stays.
        user: standing !== null && typeof standing.user === 'object' &&
            standing.user !== null ? standing.user : {},
        lang: lang(),
        events: standing !== null && typeof standing.events === 'object' &&
            standing.events !== null ? standing.events : {},
        cookie: {
            read: readCookie,
            create: (key, status) => { writeCookie(key, String(status)); },
            purge: noopfn,
            owner: {},
            checkCount: noopfn,
            crossIndexOf: noopfn,
            number: ( ) => 0,
            beautify: noopfn,
        },
        userInterface: userInterface,
        sendEvent: sendEvent,
        setConsent: (id, status) => {
            if ( status === false ) { refuse(id); } else { decide(id); }
        },
        // Reporting. Theirs posts the visitor's choice to
        // logs.tarteaucitron.io/collect; these keep the shape and send nothing.
        pro: noopfn,
        proPing: noopfn,
        proTemp: '',
        proTimer: 0,
        uuid: '',
        domain: '',
        cdn: '',
        // Theirs sets this where a refusal revokes something already launched.
        // Nothing launches here, so nothing has to be undone.
        reloadThePage: false,
        init: given => {
            if ( given !== null && typeof given === 'object' ) {
                for ( const key of Object.keys(given) ) {
                    parameters[key] = given[key];
                }
                for ( const key of Object.keys(DEFAULTS) ) {
                    if ( Object.prototype.hasOwnProperty.call(
                        parameters, key) === false ) {
                        parameters[key] = DEFAULTS[key];
                    }
                }
            }
            settle();
        },
        load: noopfn,
        launchGlobal: noopfn,
        // A site's own service, which on a self-hosted deployment is defined
        // by the site's own file - and that can land after this one. So a
        // definition arriving here is reconsidered: a custom video service
        // should not stay refused just because it was late.
        addService: (key, definition) => {
            if ( typeof key !== 'string' ) { return; }
            if ( definition !== null && typeof definition === 'object' ) {
                services[key] = definition;
            }
            describe(key);
            reconsider();
        },
        AddOrUpdate: noopfn,
        addScript: addScript,
        addInternalScript: (url, id, callback, execute, attrName, attrVal) => {
            addScript(url, id, callback, execute, attrName, attrVal);
        },
        makeAsync: { init: noopfn, open: noopfn, write: noopfn, close: noopfn },
        // Their engage builds the "click to allow" box over an embed. No UI
        // is built here: a refused embed is left as the page wrote it.
        engage: noopstrfn,
        fallback: fallback,
        extend: (a, b) => {
            const out = {};
            for ( const key of Object.keys(a || {}) ) { out[key] = a[key]; }
            for ( const key of Object.keys(b || {}) ) { out[key] = b[key]; }
            return out;
        },
        dynamicJobPush: names => {
            if ( Array.isArray(names) === false ) { return; }
            for ( const name of names ) { job.push(name); }
        },
        addServicesBundle: fetchRegistry,
        triggerJobsAfterAjaxCall: noopfn,
        initEvents: { loadEvent: noopfn, clickEvent: noopfn },
        isAjax: false,
        idprocessed: [],
        added: {},
        highPrivacy: true,
        orientation: 'middle',
        hashtag: '',
        customCloserId: '',
        handleBrowserDNTRequest: noopfalsefn,
        checkIfExist: id => doc.getElementById(String(id)) !== null,
        cleanArray: array => (Array.isArray(array) ? array.slice() : []),
        addClickEventToId: noopfn,
        addClickEventToElement: noopfn,
        getElemAttr: getElemAttr,
        getElemWidth: elem => (elem && elem.offsetWidth) || 0,
        getElemHeight: elem => (elem && elem.offsetHeight) || 0,
        getStyleSize: getStyleSize,
        getLanguage: ( ) => {
            const named = doc.documentElement !== null
                ? doc.documentElement.getAttribute('lang')
                : '';
            const text = String(named || w.navigator.language || 'en');
            return text.slice(0, 2).toLowerCase();
        },
        getLocale: ( ) => String(w.navigator.language || 'en'),
        fixSelfXSS: text => String(text === undefined ? '' : text)
            .replace(/</g, '&lt;'),
        reloadThePageFn: noopfn,
        consentRR: { name: NAME, version: VERSION },
    };

    // Everything the page already put there stays: a site's own init() may
    // have landed first, and their events object is the page's own hooks.
    const out = standing !== null ? standing : {};
    for ( const key of Object.keys(api) ) { out[key] = api[key]; }
    // A page that ASSIGNS a job list rather than pushing to one would replace
    // the live list with a plain array, and nothing would be decided at all -
    // silently. Their own build is exposed to the same thing, since it also
    // replaces job.push after init. An assignment is fed through instead.
    try {
        Object.defineProperty(out, 'job', {
            configurable: true,
            get: ( ) => job,
            set: value => {
                if ( Array.isArray(value) === false ) { return; }
                for ( const name of value ) { job.push(name); }
            },
        });
    } catch ( ex ) {
    }
    w.tarteaucitron = out;

    /**************************************************************************/

    // Their own root element, empty and hidden. No banner is built here, but
    // tac.root_available means "the markup is there to reach" and pages hook
    // it to put their own button inside the root - so firing it with nothing
    // under #tarteaucitronRoot throws inside the page's own handler. One
    // empty container is not a banner, and it keeps the event honest.
    const addRoot = ( ) => {
        try {
            if ( doc.getElementById('tarteaucitronRoot') !== null ) { return; }
            if ( doc.body === null ) { return; }
            const root = doc.createElement('div');
            root.id = 'tarteaucitronRoot';
            root.style.display = 'none';
            doc.body.appendChild(root);
        } catch ( ex ) {
        }
    };

    // Their load events, and the one their own code fires when the banner
    // markup would be there for a page to reach.
    let settled = false;
    const settle = ( ) => {
        for ( const name of queued ) { decide(name); }
        queued.length = 0;
        fetchRegistry();
        if ( settled ) { return; }
        settled = true;
        consentMode();
        addRoot();
        sendEvent('tac.root_available');
        sendEvent('tac.consent_updated');
        sendEvent('tac_consent_update');
        for ( const hook of [ 'init', 'load' ] ) {
            const fn = out.events !== null && typeof out.events === 'object'
                ? out.events[hook]
                : null;
            if ( typeof fn !== 'function' ) { continue; }
            try {
                fn();
            } catch ( ex ) {
            }
        }
    };

    settle();

    // Said once, at the end, so it reports what actually went in.
    if ( typeof console === 'object' && typeof console.info === 'function' ) {
        console.info(
            '[consent-rr] ' + NAME + ' ' + VERSION +
            ' refused=' + refused +
            ' allowed=' + allowed +
            ' launched=' + launched +
            (ALLOWED.length !== 0 ? ' types=' + ALLOWED.join('+') : '') +
            (pending.length !== 0 ? ' pending=' + pending.length : '') +
            ' cookie=' + (wrote !== 0 ? cookieName() : 'none') +
            ' entries=' + wrote +
            ' events=' + events +
            ' banner=none reload=no beacon=none'
        );
    }
}
