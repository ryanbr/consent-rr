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

    Shared implementation for zdconsent-accept.js / zdconsent-reject.js.

    Ziff Davis's own consent layer (mashable.com, speedtest.net, askmen.com,
    pcmag.com and the rest), served from cdn.ziffstatic.com/jst/zdconsent.js.

    IT IS A ONETRUST FRONT END. Its first act is to inject OneTrust's
    otSDKStub.js, and the function that decides what is consented reads
    OneTrust's own record - the OptanonConsent cookie's groups, or
    window.OnetrustActiveGroups - over the top of its own defaults. So these
    resources are the OneTrust core plus this layer, and both records are
    written: a page reading OptanonActiveGroups and a page reading
    zdconsent.optins are told the same thing.

    The OneTrust layer is handed in rather than called alongside, because
    which way it goes in is decided here: an accept that stands down over a
    GPC header has to stand the layer underneath down with it, or the record
    this file writes and the record their own code reads would disagree.

    Two files, one difference. zdconsent_eu.js is byte-identical to
    zdconsent.js but for two booleans - gdprApplies and optinApplies - baked
    true. Which one a visitor gets is the site's choice, so the variant is read
    back off the script element uBO redirected: the element keeps its original
    src. Their own geo cookies refine it after, as theirs do.

    WHAT THE QUEUES ARE FOR, and why a refusal is not enough on its own:
    a page pushes work into window.zdconsent.run / cmd / analytics /
    functional / social / useractioncomplete, and their script runs each
    queue when the matching consent exists. run is ungated. Blocking the
    script outright leaves every queue unrun - mashable.com queues nine
    things into run - which is the breakage this replaces. A function is
    called, a string is loaded as a script, an object is loaded as a script
    with its properties as attributes: all three appear on their own sites.

    THEIR DECISION PATH, from the function their Deny All button ends in:

        K=false; P=fa=true; t=h=H=J=false; L=true;
        cookie zdconsent=optout; max-age=31536000
        cookie opt_out=1;        max-age=31536000
        Ea();                     // and a call to https://zdbb.net/optout
        setTimeout(U, 10);        // recompute from OneTrust's groups

    K is consentGiven, P opted-out, t analytics, h targeting, H functional,
    J social, L userActionDone. Their Accept All is the same with the flags
    inverted, zdconsent=optin, and opt_out expired.

    GPC IS HONOURED, BUT ONLY OUTSIDE GDPR, AND THEIR COOKIE OVERRIDES IT:

        !q && navigator.globalPrivacyControl && (K=false, P=true);
        a && (a === 'optin' ? (K=true, P=false)
                            : a === 'optout' && (K=false, P=true));

    so a stored optin silently cancels a visitor's GPC header. A refusal
    agrees with GPC and is written whatever the browser sends; an accept does
    not override it - outside GDPR, where their own code reads it, a page
    that asked for accept keeps the refusal and the console line says so.

    NOT DONE HERE, deliberately:

      the adblock report   Their script sets window.adblock, calls
                           Pogo.setADB(true), writes a _pgabp cookie and
                           sends gtag('event', 'adblock', {has_adblock: 1}).
                           It is a report about the visitor, and this file
                           only exists because a blocker is installed.
      https://zdbb.net/optout
                           Their refusal calls it, and zd.core.setLocalOptout
                           with it. A redirected script talks to nobody; the
                           cookie record is the part the page reads.
      an invented site id  siteId, bu and oneTrustSiteId come from a hostname
                           table inside their file. Minting one would put an
                           id of this repo's making into a page's analytics,
                           so they are empty and the domain is computed.

*/

function consentRRZdConsent(mode, installOneTrust) {
    const w = window;
    const doc = w.document;
    const accept = mode === 'accept';
    // Substituted from package.json by tools/build.mjs.
    const VERSION = '@@VERSION@@';
    const NAME = 'zdconsent-' + mode;

    // Their own first act: a frame whose parent already has the layer is left
    // alone. Theirs is a bare try/catch around a cross-origin parent read.
    try {
        if ( w.parent !== w && w.parent.zdconsent ) { return; }
    } catch ( ex ) {
    }
    // A page that gives their tag id="zdconsent" - speedtest.net does - makes
    // window.zdconsent the script ELEMENT, because a document's ids are named
    // properties of the window. It stands until something assigns over it, so
    // a node is never the object to adopt: the API would go onto an element
    // the page then replaces.
    const found = typeof w.zdconsent === 'object' && w.zdconsent !== null
        ? w.zdconsent
        : null;
    const standing = found !== null && found.nodeType === undefined
        ? found
        : null;
    // Two requests in one document both redirected here, or the page kept a
    // second tag for the _eu variant.
    if ( standing !== null && standing.consentRR !== undefined ) { return; }

    const reHost = /^[a-z0-9.-]+$/i;

    // Their cookie reader, which is a plain name match on document.cookie.
    const readCookie = name => {
        const pairs = String(doc.cookie || '').split(';');
        for ( const pair of pairs ) {
            const at = pair.indexOf('=');
            if ( at === -1 ) { continue; }
            if ( pair.slice(0, at).trim() !== name ) { continue; }
            return decodeURIComponent(pair.slice(at + 1).trim());
        }
        return '';
    };

    // Their cookie domain, from the function that computes it: the page can
    // name it outright, a zdcdomain= query argument overrides, and otherwise
    // the hostname is cut to a registrable domain - three labels where the
    // second-to-last is com, co or web (bbc.co.uk, and their own zdbb.net),
    // two otherwise.
    const cookieDomain = ( ) => {
        let host = typeof w.__ZDConsentDomain === 'string' &&
            w.__ZDConsentDomain !== ''
            ? w.__ZDConsentDomain
            : String(w.location.hostname || '');
        const search = String(w.location.search || '');
        if ( search.indexOf('zdcdomain=') !== -1 ) {
            const named = new w.URLSearchParams(search).get('zdcdomain');
            if ( named ) { host = named; }
        }
        if ( reHost.test(host) === false ) { return ''; }
        const labels = host.split('.').reverse();
        if ( labels.length < 2 ) { return ''; }
        const keep = labels.length >= 2 && /^(com|co|web)$/i.test(labels[1])
            ? labels.splice(0, 3)
            : labels.splice(0, 2);
        return keep.reverse().join('.');
    };

    const domain = cookieDomain();
    // Their suffix, appended to every cookie they write, including the leading
    // separator. An empty domain leaves the cookie host-only, which is what
    // theirs does on a hostname it cannot cut.
    const suffix = domain !== '' ? ' domain=.' + domain + ';' : '';

    const writeCookie = (name, value, seconds) => {
        try {
            doc.cookie = name + '=' + value + '; path=/; max-age=' +
                seconds + ';' + suffix;
        } catch ( ex ) {
        }
    };
    const dropCookie = name => {
        try {
            const gone = '=; expires=Thu, 01 Jan 1970 00:00:01 GMT; path=/;';
            doc.cookie = name + gone + suffix;
            doc.cookie = name + gone;
        } catch ( ex ) {
        }
    };

    // Which of the two files this is standing in for. uBO redirects the
    // request, so the element in the document still carries the original src -
    // the only place the variant can be read from. A scriptlet injection has
    // no currentScript, hence the sweep.
    const variant = ( ) => {
        const named = src => /zdconsent[_-]?eu/i.test(String(src || ''));
        const mine = doc.currentScript;
        if ( mine !== null && mine !== undefined ) {
            if ( named(mine.src) ) { return true; }
            if ( String(mine.src || '').indexOf('zdconsent') !== -1 ) {
                return false;
            }
        }
        for ( const node of doc.querySelectorAll('script[src*="zdconsent"]') ) {
            if ( named(node.src) ) { return true; }
        }
        return false;
    };

    // Their geo map, from the function that applies a country code. The lists
    // are theirs; the regime each one lands in is what the page is told.
    const GDPR = /^(be|bg|cz|dk|de|ee|ie|el|es|fr|hr|it|cy|lv|lt|lu|hu|mt|nl|at|pl|pt|ro|si|sk|fi|se|no|gb|uk|ch)$/i;
    const OPTIN = /^(jp|br|in|sg|ae|kr|ng|cn|tw|il|tr|ar|ml|za|unk)$/i;

    // Their overrides, which is how their own staff force a regime, and the
    // only way to exercise this without travelling.
    const forced = ( ) => {
        const where = String(w.location.search || '') +
            String(w.location.hash || '');
        const named = /zdconsent2=(EU|FR|BR|US|FJ|COLORADO)/i.exec(where);
        if ( named === null ) { return null; }
        const name = named[1].toUpperCase();
        if ( name === 'EU' ) { return { cc: 'GB', rc: '' }; }
        if ( name === 'US' ) { return { cc: 'US', rc: 'NY' }; }
        if ( name === 'COLORADO' ) { return { cc: 'US', rc: 'CO' }; }
        return { cc: name, rc: '' };
    };

    // geoCC and geoRC are their own cookies, and on speedtest.net the country
    // is also on window.OOKLA. Nothing is fetched to find out: an unknown
    // location leaves the variant's own answer standing.
    const where = ( ) => {
        const override = forced();
        if ( override !== null ) { return override; }
        let cc = readCookie('geoCC');
        let rc = readCookie('geoRC');
        if ( cc === '' ) {
            try {
                const ookla = w.OOKLA.globals.location;
                if ( ookla.countryCode ) { cc = String(ookla.countryCode); }
                if ( ookla.regionCode ) { rc = String(ookla.regionCode); }
            } catch ( ex ) {
            }
        }
        return { cc: cc.toUpperCase(), rc: String(rc || '').toUpperCase() };
    };

    const place = where();
    const eu = variant();
    // gdprApplies, optinApplies and ccpaApplies, in their names: q, n and da.
    // With no geo to go on the variant decides, which is what the site's own
    // choice of file said.
    let gdprApplies = eu;
    let optinApplies = eu;
    // Theirs sets ccpaApplies inside the function that applies a country, so
    // with no country to go on the field is absent rather than false - which
    // is what a page reading it off their own script finds.
    let ccpaApplies = null;
    if ( place.cc === 'US' ) {
        ccpaApplies = true;
        gdprApplies = false;
        // Theirs turns opt-in on for some states, but only for business units
        // named in a table inside their file (health, pnp, tech on CA). That
        // table is not derivable from a page, so the default stands.
        optinApplies = false;
    } else if ( place.cc !== '' ) {
        if ( GDPR.test(place.cc) ) {
            gdprApplies = optinApplies = true;
        } else if ( OPTIN.test(place.cc) ) {
            gdprApplies = false;
            optinApplies = true;
        } else if ( place.cc === 'CA' ) {
            gdprApplies = false;
            optinApplies = place.rc === 'QC';
        } else {
            gdprApplies = optinApplies = false;
        }
        if ( ccpaApplies === null ) { ccpaApplies = false; }
    }

    // Outside GDPR their script reads GPC, and reads it before their own
    // cookie. An accept that overrode it would be this resource cancelling a
    // signal the visitor set deliberately, so it does not: the refusal stands
    // and the console line names why.
    let gpc = false;
    try {
        gpc = gdprApplies === false &&
            w.navigator.globalPrivacyControl === true;
    } catch ( ex ) {
    }
    const granting = accept && gpc === false;

    // The layer underneath, in whichever direction this one went, and before
    // anything is drained: page code that runs from the run queue reads
    // OptanonActiveGroups, so OneTrust's record has to be in place first.
    if ( typeof installOneTrust === 'function' ) {
        installOneTrust(granting ? 'accept' : 'reject');
    }

    // Their flags, from the two functions their buttons end in.
    const consentGiven = granting;
    const optedOut = granting === false;
    const analyticsOk = granting;
    const targetingOk = granting;
    const functionalOk = granting;
    const socialOk = granting;

    // Their us_privacy string: version 1, notice given, sale opt-out, no LSPA.
    // Not applicable at all under GDPR, where theirs answers 1---.
    const uspString = gdprApplies
        ? '1---'
        : '1Y' + (optedOut ? 'Y' : 'N') + 'Y';

    // Their optins object, field for field, including comscore being 1 or 0
    // where the rest are true or false, and ccpa being a notice rather than a
    // consent - false only where an opt-in regime applies and targeting does
    // not.
    const optins = ( ) => ({
        comscore: analyticsOk ? 1 : 0,
        ga: analyticsOk,
        snowplow: analyticsOk,
        googleads: targetingOk,
        ccpa: optinApplies && targetingOk === false ? false : true,
        core: targetingOk,
        facebook: targetingOk,
        krux: targetingOk,
    });

    // The queue names they create, in their order.
    const QUEUES = [
        'run', 'cmd', 'useractioncomplete', 'targeting', 'analytics',
        'functional', 'social',
    ];

    // Their data layer, whose name is per-site: dataLayer, or _hbdl, or
    // ga4DataLayer, decided by a brand table inside their file. An array a
    // page has already put up is the one it reads, so one standing is adopted
    // rather than a second being invented.
    const layer = ( ) => {
        for ( const name of [ 'dataLayer', '_hbdl', 'ga4DataLayer' ] ) {
            if ( Array.isArray(w[name]) ) { return w[name]; }
        }
        w.dataLayer = [];
        return w.dataLayer;
    };

    // Their dispatcher: a plain Event at the window - not the document - once
    // per name, and the same name into the data layer as { event: name }.
    const fired = Object.create(null);
    let events = 0;
    const fire = name => {
        if ( fired[name] !== undefined ) { return; }
        fired[name] = 1;
        events += 1;
        try {
            w.dispatchEvent(new w.Event(name));
        } catch ( ex ) {
        }
        try {
            layer().push({ event: name });
        } catch ( ex ) {
        }
    };

    // Their script loader, which takes a url or an object of attributes. A
    // queue entry that is not a function is one of these on their own sites:
    // "https://...chartbeat_video.js" and { src: '/iterable/push-consent.js',
    // type: 'module' } both appear. uBlock Origin decides what a page is then
    // allowed to fetch, as it would have either way.
    const inject = spec => {
        const node = doc.createElement('script');
        node.async = true;
        if ( typeof spec === 'string' ) {
            node.src = spec;
        } else {
            for ( const key of Object.keys(spec) ) {
                try {
                    node[key] = spec[key];
                } catch ( ex ) {
                }
            }
        }
        const head = doc.getElementsByTagName('head')[0] ||
            doc.documentElement;
        if ( head !== null ) { head.appendChild(node); }
    };

    // Their queue entry runner: a function is deferred, a boolean ignored,
    // anything else loaded. Theirs logs a throw rather than letting it stop
    // the rest of the queue.
    const call = (entry, which) => {
        if ( !entry || typeof entry === 'boolean' ) { return; }
        try {
            if ( typeof entry === 'function' ) {
                w.setTimeout(entry, 0);
            } else {
                inject(entry);
            }
        } catch ( ex ) {
            if ( typeof console === 'object' &&
                typeof console.log === 'function' ) {
                console.log('ZDConsent ' + which + ' queue error', ex, entry);
            }
        }
    };

    // Their drain: the original push is kept as _push, push becomes immediate,
    // what is already queued runs, and _processed marks it done so a second
    // pass cannot double-run it.
    let drained = 0;
    const drain = which => {
        const queue = w.zdconsent[which];
        if ( Array.isArray(queue) === false ) { return; }
        if ( queue._processed === true ) { return; }
        queue._push = queue.push;
        queue.push = entry => {
            call(entry, which);
            return queue.length;
        };
        for ( const entry of queue.slice() ) { call(entry, which); }
        queue._processed = true;
        drained += 1;
    };

    // Everything the page can read, with their own names. getConsentData and
    // the aps pair answer the shape theirs answers with no OneTrust loaded and
    // no TC string: an empty string and an empty object, never a made-up id.
    const api = {
        inited: true,
        gdprApplies: gdprApplies,
        ccpaApplies: ccpaApplies,
        optinApplies: optinApplies,
        consentGiven: consentGiven,
        userActionDone: true,
        geoCC: place.cc !== '' ? place.cc : null,
        geoRC: place.rc !== '' ? place.rc : null,
        domain: domain,
        // isPremiumSubscriber is deliberately not here. It is the page's own
        // field - their script reads it, next to ZDUniversalParameters, to
        // decide whether a visitor is a subscriber - and writing false over it
        // would answer for the page.
        // Theirs come from a hostname table in their file. An id invented here
        // would be an id of this repo's making in a page's analytics.
        siteId: '',
        bu: '',
        oneTrustSiteId: '',
        oneTrustUserId: '',
        optins: optins(),
        // Theirs answers with the TC string their TCF data holds, so this
        // answers with the one the layer underneath installed: a page reading
        // it and a page calling __tcfapi are told the same thing.
        getConsentString: ( ) => {
            let found = '';
            try {
                w.__tcfapi('getTCData', 2, data => {
                    if ( data && typeof data.tcString === 'string' ) {
                        found = data.tcString;
                    }
                });
            } catch ( ex ) {
            }
            return found;
        },
        getUSPrivacyString: ( ) => uspString,
        getConsentData: ( ) => ({
            consentData: '',
            gdprApplies: gdprApplies,
            hasGlobalConsent: null,
        }),
        getApsConsent: ( ) => ({}),
        getApsParams: ( ) => ({}),
        // Theirs routes these into OneTrust's preference centre. The OneTrust
        // layer under this one answers them, and there is no banner to reopen.
        showConsentTool: ( ) => {
            try {
                w.OneTrust.ToggleInfoDisplay();
            } catch ( ex ) {
            }
        },
        showPrivacyPolicy: ( ) => {
            try {
                w.OneTrust.ToggleInfoDisplay();
            } catch ( ex ) {
            }
        },
        resetOneTrust: ( ) => {
            dropCookie('zdconsent');
            dropCookie('opt_out');
        },
        // Theirs re-runs their own geo code with a country handed in. The
        // record is already written here, so the fields are updated and the
        // page is told, rather than a decision being taken again.
        setGeo: (cc, rc) => {
            const api2 = w.zdconsent;
            api2.geoCC = cc ? String(cc).toUpperCase() : null;
            api2.geoRC = rc ? String(rc).toUpperCase() : null;
        },
        // Theirs pushes the arguments object into the data layer, deferring
        // until it is ready; this one is ready, so it pushes. A page's own
        // analytics call is the page's to make, and uBlock Origin decides
        // what the tag it feeds is then allowed to fetch.
        gtag: function() {
            try {
                layer().push(arguments);
            } catch ( ex ) {
            }
        },
        _forceLoad: ( ) => undefined,
        _getCookieDomain: ( ) => domain,
        _setupNonGdprTCF: ( ) => undefined,
        // Accept-or-pay. Theirs reports whether it rewrote OneTrust's reject
        // button into a subscribe link; no banner is built here, so there is
        // no wall to report.
        _hasAOP: ( ) => false,
        consentRR: { name: NAME, version: VERSION, mode: mode },
    };

    // The queues a page declared before their tag are the arrays it pushes to,
    // so they are adopted rather than replaced. speedtest.net declares six of
    // the seven inline, above the tag.
    w.zdconsent = standing !== null ? standing : {};
    for ( const name of QUEUES ) {
        if ( Array.isArray(w.zdconsent[name]) === false ) {
            w.zdconsent[name] = [];
        }
    }
    for ( const key of Object.keys(api) ) { w.zdconsent[key] = api[key]; }
    if ( ccpaApplies === null ) { delete w.zdconsent.ccpaApplies; }

    // Their record. The refusal is both cookies, as their Deny All writes
    // them, plus the one their opt-out path adds; granting expires opt_out
    // instead, as their Accept All does.
    const YEAR = 31536000;
    writeCookie('zdconsent', granting ? 'optin' : 'optout',
        granting ? 33955200 : YEAR);
    let wrote = 1;
    if ( granting ) {
        dropCookie('opt_out');
    } else {
        writeCookie('opt_out', '1', YEAR);
        writeCookie('zd_core_lialready', 'true', 1296000);
        wrote += 2;
    }
    // Only outside GDPR, where theirs writes it.
    if ( gdprApplies === false ) {
        writeCookie('usprivacy', uspString, YEAR);
        wrote += 1;
    }

    // Their US privacy API, which their script puts up itself rather than
    // waiting for OneTrust. Theirs answers a version 2 call by refusing
    // rather than queueing for an SDK that is never coming.
    const uspapi = (command, version, callback) => {
        try {
            if ( typeof callback !== 'function' ) { return; }
            if ( version > 1 ) { return callback(null, false); }
            if ( String(command).toLowerCase() !== 'getuspdata' ) {
                return callback(null, false);
            }
            callback({ version: 1, uspString: uspString }, true);
        } catch ( ex ) {
        }
    };
    uspapi.consentRR = VERSION;
    if ( typeof w.__uspapi !== 'function' || w.__uspapi.consentRR === undefined ) {
        w.__uspapi = uspapi;
    }

    // Their order, from the function that runs when their script is ready:
    // the two load events and run, whatever was decided, then the per-category
    // queues and events behind the matching consent, then the one that says
    // the visitor has answered.
    fire('zdconsentloaded');
    fire('zdconsent-loaded');
    drain('run');
    if ( analyticsOk ) {
        drain('analytics');
        fire('zdconsent-analytics');
    }
    if ( functionalOk ) {
        drain('functional');
        fire('zdconsent-functional');
    }
    if ( socialOk ) {
        drain('social');
        fire('zdconsent-social');
    }
    if ( targetingOk ) {
        drain('cmd');
        fire('zdconsentgiven');
        fire('zdconsent-targeting');
        fire('evidonConsentGiven');
    }
    drain('useractioncomplete');
    fire('zdconsent-userconsentupdated');

    // Said once, at the end, so it reports what actually went in. gpc= is the
    // answer to the question their own code asks, and names the case where an
    // accept resource deliberately did not grant.
    if ( typeof console === 'object' && typeof console.info === 'function' ) {
        console.info(
            '[consent-rr] ' + NAME + ' ' + VERSION +
            ' variant=' + (eu ? 'eu' : 'default') +
            ' gdpr=' + gdprApplies +
            ' geo=' + (place.cc !== '' ? place.cc + (place.rc !== '' ? '/' + place.rc : '') : 'unknown') +
            ' consent=' + (granting ? 'given' : 'refused') +
            ' gpc=' + (gdprApplies ? 'n/a' : (gpc ? 'set' : 'unset')) +
            (accept && granting === false ? ' skipped=accept want=gpc' : '') +
            ' usp=' + uspString +
            ' cookies=' + wrote +
            ' queues=' + drained +
            ' events=' + events
        );
    }
}
