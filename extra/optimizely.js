/// optimizely.js
// Resource replacement for Optimizely Web Experimentation snippets served
// from cdn.optimizely.com/js/<projectId>.js. It reads the Performance Edge
// shape, /public/<account>/<project>/<revision>_<hash>_edge_helper.js, as
// well, which the rule below does not cover.
// Not a cookie-consent resource: it lives outside src/ and is not built
// into dist/ by tools/build.mjs. Hand-maintained, ship as-is.
// THE NOTES ARE IN extra/optimizely.md - every member and what each
// decision traded, what the file publishes, and what it costs a page.
// The comments below are a line each; the reasoning for them is there.
// --
// THE RULE
//   ||cdn.optimizely.com/js/*.js$script,redirect=optimizely.js
// A redirect leaves the script element carrying the url it was going to
// fetch, which is the only place the project identity survives. That is
// the snippet path only. No rule for the Performance Edge path is written
// here: the resource handles one if a rule is pointed at it, but no file
// served from that path has been checked, and an operational line written
// from memory is how the perimeterx rules went wrong once.
// --
// A comment indented into the body ships to every user - uBO strips only
// the ones at column zero - so keep those to one line and put the rest in
// the .md. This file was once a quarter prose by weight.
// The page keeps a working window.optimizely - push, get, initialized and
// the lifecycle listeners, plus the flat Classic api for the projects whose
// snippet predates the migration - so code that queues commands or waits on
// the client proceeds. What it loses is everything the real client does with
// them: no experiment or campaign data, no variation DOM rewriting, no
// redirect experiments, no visitor profile, no optimizelyEndUserId or
// session cookies, no localStorage, and no beacons to logx.optimizely.com,
// rum.optimizely.com or prediction.cmab.optimizely.com.
// The "///" line above is the resource header uBO reads, and a comment to
// JavaScript. uBO drops these "//" lines when it parses.
(function() {
    'use strict';
    const w = window;
    const doc = w.document;
    const existing = w.optimizely;
    if ( existing && Array.isArray(existing) === false && typeof existing.get === 'function' ) {
        return;
    }
    const CLIENT_NAME = 'js';
    const CLIENT_VERSION = '0.261.0';
    const POLL_INTERVAL = 20;
    const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
    // The redirected url is the only place the project identity survives.
    const identityFromScript = ( ) => {
        const blank = { accountId: null, projectId: null, revision: null };
        try {
            const el = doc.currentScript;
            const src = el && el.src || '';
            const direct = /\/(\d{6,})\.js/.exec(src);
            if ( direct !== null ) {
                return {
                    accountId: null, projectId: direct[1], revision: null,
                };
            }
            const nested = /\/public\/(\d+)\/(\d+)\/(?:(\d+)_)?/.exec(src);
            if ( nested !== null ) {
                return {
                    accountId: nested[1],
                    projectId: nested[2],
                    revision: nested[3] !== undefined ? nested[3] : null,
                };
            }
            return blank;
        } catch ( ex ) {
            return blank;
        }
    };
    const randomId = ( ) => {
        const bytes = new Uint8Array(16);
        try {
            w.crypto.getRandomValues(bytes);
        } catch ( ex ) {
            for ( let i = 0; i < 16; i++ ) {
                bytes[i] = Math.floor(Math.random() * 256);
            }
        }
        bytes[6] = bytes[6] & 15 | 64;
        bytes[8] = bytes[8] & 63 | 128;
        let hex = '';
        for ( let i = 0; i < 16; i++ ) {
            hex += (bytes[i] + 256).toString(16).slice(-2);
        }
        return [
            hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16),
            hex.slice(16, 20), hex.slice(20),
        ].join('-');
    };
    const observers = [];
    let mutationObserver = null;
    // No entries left: the observer goes rather than idling for the page.
    const releaseObserver = ( ) => {
        if ( observers.length !== 0 || mutationObserver === null ) { return; }
        mutationObserver.disconnect();
        mutationObserver = null;
    };
    // Removal is by identity; a nested register invalidates a loop index.
    const drop = entry => {
        const at = observers.indexOf(entry);
        if ( at !== -1 ) { observers.splice(at, 1); }
    };
    const scanEntry = entry => {
        let nodes;
        try {
            nodes = doc.querySelectorAll(entry.selector);
        } catch ( ex ) {
            return false;
        }
        for ( const node of nodes ) {
            if ( entry.seen.has(node) ) { continue; }
            entry.seen.add(node);
            try {
                entry.callback(node);
            } catch ( ex ) {
            }
            if ( entry.once ) { return false; }
        }
        return true;
    };
    const scanObservers = ( ) => {
        for ( const entry of observers.slice() ) {
            if ( scanEntry(entry) === false ) { drop(entry); }
        }
        releaseObserver();
    };
    const observeSelector = (selector, callback, options) => {
        let valid = typeof selector === 'string';
        if ( valid ) {
            try {
                doc.querySelector(selector);
            } catch ( ex ) {
                valid = false;
            }
        }
        if ( valid === false ) {
            throw new Error('observeSelector expects a valid css selector as its first argument');
        }
        if ( typeof callback !== 'function' ) {
            throw new Error('observeSelector expects a function as its second argument');
        }
        if ( options !== undefined && options !== null ) {
            if ( typeof options !== 'object' || typeof options === 'function' ) {
                throw new Error('observeSelector expects an object as its third argument');
            }
        }
        const entry = {
            selector,
            callback,
            once: options ? options.once === true : false,
            seen: new WeakSet(),
        };
        observers.push(entry);
        if ( mutationObserver === null && typeof w.MutationObserver === 'function' ) {
            const root = doc.documentElement || doc;
            mutationObserver = new w.MutationObserver(scanObservers);
            try {
                mutationObserver.observe(root, { childList: true, subtree: true });
            } catch ( ex ) {
                mutationObserver = null;
            }
        }
        if ( scanEntry(entry) === false ) {
            drop(entry);
            releaseObserver();
        }
        return ( ) => {
            drop(entry);
            releaseObserver();
        };
    };
    // One interval per period, keyed by token so one callback can wait twice.
    const pollGroups = new Map();
    const poll = (callback, interval) => {
        if ( typeof interval !== 'number' ) { interval = POLL_INTERVAL; }
        let group = pollGroups.get(interval);
        if ( group === undefined ) {
            group = { id: 0, callbacks: new Map() };
            group.id = w.setInterval(( ) => {
                for ( const fn of Array.from(group.callbacks.values()) ) {
                    try {
                        fn();
                    } catch ( ex ) {
                    }
                }
            }, interval);
            pollGroups.set(interval, group);
        }
        const token = {};
        group.callbacks.set(token, callback);
        return ( ) => {
            if ( group.callbacks.delete(token) === false ) { return; }
            if ( group.callbacks.size !== 0 ) { return; }
            w.clearInterval(group.id);
            pollGroups.delete(interval);
        };
    };
    const waitUntil = condition => new Promise(resolve => {
        // No guard: theirs throws on a non-callable condition, as this does.
        if ( condition() ) {
            resolve();
            return;
        }
        const cancel = poll(( ) => {
            if ( condition() ) {
                cancel();
                resolve();
            }
        });
    });
    const waitForElement = selector => new Promise(resolve => {
        observeSelector(selector, resolve, { once: true });
    });
    const urlChangeHandlers = new Map();
    // Cleared on the last unsubscribe, so a still-wrapped wrapper stays quiet.
    let historyPatch = null;
    let nativePushState = null;
    let nativeReplaceState = null;
    let ourPushState = null;
    let ourReplaceState = null;
    const notifyUrlChange = ( ) => {
        for ( const handler of Array.from(urlChangeHandlers.values()) ) {
            try {
                handler(w.location.href);
            } catch ( ex ) {
            }
        }
    };
    const onUrlChange = handler => {
        if ( typeof handler !== 'function' ) { return ( ) => { }; }
        const token = randomId();
        const first = urlChangeHandlers.size === 0;
        urlChangeHandlers.set(token, handler);
        if ( first ) {
            w.addEventListener('popstate', notifyUrlChange);
            w.addEventListener('hashchange', notifyUrlChange);
            if ( historyPatch === null ) {
                const patch = { active: true };
                // For these wrappers only; the shared variables move on.
                const pushState = w.history.pushState;
                const replaceState = w.history.replaceState;
                nativePushState = pushState;
                nativeReplaceState = replaceState;
                w.history.pushState = function() {
                    pushState.apply(w.history, arguments);
                    if ( patch.active ) {
                        notifyUrlChange();
                    }
                };
                w.history.replaceState = function() {
                    replaceState.apply(w.history, arguments);
                    if ( patch.active ) {
                        notifyUrlChange();
                    }
                };
                ourPushState = w.history.pushState;
                ourReplaceState = w.history.replaceState;
                historyPatch = patch;
            }
        }
        return ( ) => {
            urlChangeHandlers.delete(token);
            if ( urlChangeHandlers.size !== 0 ) { return; }
            w.removeEventListener('popstate', notifyUrlChange);
            w.removeEventListener('hashchange', notifyUrlChange);
            if ( historyPatch !== null ) {
                historyPatch.active = false;
                // Restore only while ours are still installed, as theirs does.
                if ( w.history.pushState === ourPushState ) {
                    w.history.pushState = nativePushState;
                }
                if ( w.history.replaceState === ourReplaceState ) {
                    w.history.replaceState = nativeReplaceState;
                }
                ourPushState = null;
                ourReplaceState = null;
                historyPatch = null;
            }
        };
    };
    const PLACEMENTS = {
        before: 'beforebegin',
        after: 'afterend',
        first_child: 'afterbegin',
        last_child: 'beforeend',
    };
    // Inserts once: the re-insertion exists for variation code.
    const persistHtml = (html, selector, placement) => {
        if ( typeof html !== 'string' || html === '' ) {
            throw new Error('persistHtml: html must be a non-empty string');
        }
        try {
            doc.querySelector(selector);
        } catch ( ex ) {
            throw new Error('persistHtml: invalid CSS selector: ' + selector);
        }
        if ( placement === undefined || placement === null ) { placement = 'before'; }
        if ( hasOwn(PLACEMENTS, placement) === false ) {
            throw new Error('persistHtml: placement must be one of: ' + Object.keys(PLACEMENTS).join(', '));
        }
        const target = doc.querySelector(selector);
        if ( target === null ) {
            throw new Error('persistHtml: no element found for selector "' + selector + '"');
        }
        try {
            target.insertAdjacentHTML(PLACEMENTS[placement], html);
        } catch ( ex ) {
        }
        return ( ) => { };
    };
    // Silent until a level is set, as theirs is. The wording is theirs.
    const LOG_LEVELS = { OFF: 0, ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4 };
    let logLevel = null;
    const setLogLevel = level => {
        const resolved = typeof level === 'string'
            ? LOG_LEVELS[level.toUpperCase()]
            : level;
        if ( typeof resolved !== 'number' ) {
            try {
                w.console.error('Unknown log level: ' + level);
            } catch ( ex ) {
            }
            return;
        }
        logLevel = resolved;
    };
    const warn = (message, detail) => {
        if ( logLevel === null || logLevel < LOG_LEVELS.WARN ) { return; }
        try {
            if ( detail === undefined ) {
                w.console.warn(message);
            } else {
                w.console.warn(message, detail);
            }
        } catch ( ex ) {
        }
    };
    const identity = identityFromScript();
    const state = {
        getActivationId: ( ) => null,
        getActiveExperimentIds: ( ) => [],
        getCampaignStateLists: ( ) => ({}),
        getCampaignStates: ( ) => ({}),
        getDecisionObject: ( ) => null,
        getDecisionString: ( ) => null,
        getExperimentStates: ( ) => ({}),
        getPageStates: ( ) => ({}),
        getRedirectInfo: ( ) => null,
        getTrafficExclusionStats: ( ) => ({}),
        getVariationMap: ( ) => ({}),
        isGlobalHoldback: ( ) => false,
    };
    const data = {
        accountId: identity.accountId,
        audiences: {},
        campaigns: {},
        clientName: CLIENT_NAME,
        clientVersion: CLIENT_VERSION,
        dcpServiceId: null,
        events: {},
        experiments: {},
        groups: {},
        pages: {},
        projectId: identity.projectId,
        revision: identity.revision,
        snippetId: identity.projectId,
        variations: {},
    };
    // Their profile providers, one key each. Nothing here is measured.
    const visitor = {
        browserId: '',
        browserVersion: '',
        campaign: null,
        cookies: {},
        custom: {},
        customBehavior: [],
        dcpData: {},
        device: '',
        device_type: '',
        events: [],
        first_session: true,
        IP: '',
        language: '',
        location: {
            city: '',
            continent: '',
            country: '',
            dma: '',
            region: '',
        },
        offset: 0,
        platform: '',
        queryParams: {},
        referrer: '',
        source_type: 'direct',
        url: '',
        visitorId: null,
    };
    // Lazy in theirs, so a read takes the time of the read.
    Object.defineProperty(visitor, 'currentTimestamp', {
        enumerable: true,
        get: ( ) => Date.now(),
    });
    const utils = {
        observeSelector,
        onUrlChange,
        persistHtml,
        poll,
        Promise: w.Promise,
        waitForElement,
        waitUntil,
    };
    // The argument checks are theirs; the event store here holds nothing.
    const RECENCY_FILTERS = [ 'most_recent', 'least_recent' ];
    const FREQUENCY_FILTERS = [ 'most_frequent', 'least_frequent' ];
    const descriptorProblems = (descriptor, allowed) => {
        if ( !descriptor ) { return [ 'Descriptor not defined' ]; }
        const problems = [];
        if ( descriptor.count ) {
            problems.push('Unexpected "count" clause specified');
        }
        const pick = descriptor.pick;
        if ( pick && pick.modifier && allowed.indexOf(pick.modifier) === -1 ) {
            problems.push('Invalid "pick" modifier "' + pick.modifier + '"');
        }
        for ( const filter of descriptor.filters || [] ) {
            if ( filter && filter.modifier !== undefined ) {
                problems.push('Unexpected "filter" modifier "' + filter.modifier + '"');
            }
        }
        return problems.length !== 0 ? problems : undefined;
    };
    const behavior = {
        getEvents: descriptor => {
            if ( descriptor === undefined ) { return []; }
            if ( typeof descriptor === 'number' ) {
                if ( descriptor <= 0 ) {
                    throw new Error('Count must be a positive integer, got ' + descriptor);
                }
                return [];
            }
            const problems = descriptorProblems(descriptor, RECENCY_FILTERS);
            if ( problems !== undefined ) { throw new Error(problems.join('\n')); }
            return [];
        },
        getByFrequency: descriptor => {
            const spec = descriptor !== undefined && descriptor !== null
                ? descriptor
                : {};
            if ( !spec.pick ) {
                throw new Error('No "pick" clause provided in query descriptor');
            }
            if ( !spec.pick.name ) {
                throw new Error('No field name provided in "pick" clause');
            }
            const problems = descriptorProblems(spec, FREQUENCY_FILTERS);
            if ( problems !== undefined ) { throw new Error(problems.join('\n')); }
            return [];
        },
        query: descriptor => {
            const spec = descriptor !== undefined && descriptor !== null
                ? descriptor
                : {};
            // A reduce over no events has nothing to hand back.
            return spec.reduce ? undefined : [];
        },
    };
    const modules = {
        behavior,
        data,
        state,
        utils,
        visitor,
        visitor_id: { randomId: randomId() },
    };
    const get = name => {
        // Theirs borrows the page's $ and never looks at window.jQuery.
        if ( name === 'jquery' ) { return w.$; }
        // Declared below, and reached only once the api is installed.
        if ( name === 'event_emitter' ) { return eventEmitter; }
        if ( hasOwn(modules, name) ) { return modules[name]; }
        warn('Module "' + name + '" not found.');
        return undefined;
    };
    const listeners = [];
    const fired = Object.create(null);
    const STICKY = { activated: true, initialized: true, originsSynced: true };
    const eventMatches = (filter, ev) => {
        if ( filter === undefined || filter === null ) { return true; }
        if ( filter.type !== undefined && filter.type !== ev.type ) { return false; }
        if ( filter.name !== undefined && filter.name !== ev.name ) { return false; }
        return true;
    };
    const emit = ev => {
        if ( ev.type === 'lifecycle' ) { fired[ev.name] = true; }
        for ( const entry of listeners.slice() ) {
            if ( eventMatches(entry.filter, ev) === false ) { continue; }
            try {
                entry.handler(ev);
            } catch ( ex ) {
            }
        }
    };
    const dropByToken = token => {
        for ( let i = listeners.length - 1; i >= 0; i-- ) {
            if ( listeners[i].token === token ) { listeners.splice(i, 1); }
        }
    };
    // Theirs tokens the spec it was handed and hands the same token back.
    const register = spec => {
        if ( !spec.token ) { spec.token = randomId(); }
        listeners.push({
            filter: spec.filter, handler: spec.handler, token: spec.token,
        });
        return spec.token;
    };
    const replaySticky = spec => {
        const filter = spec.filter;
        if ( !filter || filter.type !== 'lifecycle' ) { return; }
        if ( STICKY[filter.name] !== true || fired[filter.name] !== true ) { return; }
        try {
            spec.handler({ type: 'lifecycle', name: filter.name });
        } catch ( ex ) {
        }
    };
    const addListener = spec => {
        if ( spec === null || typeof spec !== 'object' || typeof spec.handler !== 'function' ) {
            throw new Error('A handler function must be supplied');
        }
        const token = register(spec);
        replaySticky(spec);
        return token;
    };
    const removeListener = spec => {
        if ( spec === null || typeof spec !== 'object' || !spec.token ) {
            throw new Error('Must supply a token to removeListener');
        }
        dropByToken(spec.token);
    };
    // In their module registry: on takes the spec, off the bare token.
    const eventEmitter = {
        on: spec => {
            if ( spec === null || typeof spec !== 'object' ) { return undefined; }
            const token = register(spec);
            replaySticky(spec);
            return token;
        },
        off: token => { dropByToken(token); },
        emit: ev => {
            if ( ev === null || typeof ev !== 'object' ) { return; }
            emit(ev);
        },
    };
    const noop = ( ) => { };
    // Two tables, because theirs refuses a name in the wrong version.
    const commandsV0 = {
        activateGeoDelayedExperiments: noop,
        activateSiteCatalyst: noop,
        bucketUser: noop,
        bucketVisitor: noop,
        disable: noop,
        log: enabled => {
            setLogLevel(enabled === undefined || enabled ? 'INFO' : 'OFF');
        },
        optOut: noop,
        setCookieDomain: noop,
        setCookieExpiration: noop,
        setDimensionValue: noop,
        setGA4UserId: noop,
        setUserId: noop,
        storeThirdPartyData: noop,
        trackEvent: noop,
    };
    const commandsV1 = {
        activate: noop,
        addListener,
        bucketVisitor: noop,
        clientMetadata: noop,
        cookieDomain: noop,
        cookieExpiration: noop,
        dataFromSource: noop,
        disable: noop,
        disableCrossOrigin: noop,
        event: noop,
        extendCookieLifetime: noop,
        ga4User: noop,
        holdEvents: noop,
        initialViewStates: noop,
        integrationSettings: noop,
        load: noop,
        loadEmbeddedEditor: noop,
        log: spec => { setLogLevel(spec.level); },
        microsnippetError: noop,
        optOut: noop,
        page: noop,
        priorRedirectString: noop,
        registerModule: noop,
        removeListener,
        rum: noop,
        sendEvents: noop,
        tags: noop,
        user: noop,
        waitForOriginSync: noop,
    };
    const commandTables = [ commandsV0, commandsV1, {} ];
    // The six names their own boot drains early, before opt-out and disable.
    const HIGH_PRIORITY = [
        'clientMetadata', 'cookieDomain', 'disable', 'load', 'optOut', 'rum',
    ];
    const push = (command, highPriorityOnly) => {
        let version;
        let name;
        let args;
        if ( Array.isArray(command) ) {
            version = 0;
            name = command[0];
            args = command.slice(1);
        } else if ( command !== null && typeof command === 'object' ) {
            version = command.version !== undefined ? command.version : 1;
            name = command.type;
            args = [ command ];
        } else if ( typeof command === 'string' ) {
            version = 0;
            name = command;
            args = [];
        } else {
            warn('API / Ignoring non-array/object/string argument:', command);
            return false;
        }
        if ( highPriorityOnly && HIGH_PRIORITY.indexOf(name) === -1 ) {
            return false;
        }
        const table = commandTables[version];
        if ( table === undefined || hasOwn(table, name) === false ) {
            warn(
                'API / No function found for "' + name + '" (v' + version +
                ') with arguments:',
                args
            );
            return false;
        }
        try {
            table[name].apply(null, args);
        } catch ( ex ) {
        }
        return true;
    };
    // Classic, still served for projects saved before the migration.
    const classicData = {
        note: "Obsolete, use optimizely.get('data') instead",
        audiences: {},
        customTags: {},
        experiments: {},
        sections: {},
        segments: {},
        thirdParty: {},
        variations: {},
        state: {
            activeExperiments: [],
            enabled: true,
            integrations: { activeOAuthClientIds: [] },
            redirectExperiment: undefined,
            variationIdsMap: {},
            variationMap: {},
            variationNamesMap: {},
        },
        visitor: {
            audiences: {},
            browser: '',
            browserVersion: '',
            device: '',
            deviceType: '',
            dimensions: {},
            ip: '',
            lists: {},
            location: {},
            matchingRules: {},
            mobile: false,
            mobileId: '',
            os: '',
            params: {},
            platform: '',
            referrer: '',
            segments: {},
        },
    };
    const classic = {
        activeExperiments: [],
        allExperiments: {},
        all_experiments: {},
        allVariations: {},
        getElementsByClassName: name => doc.getElementsByClassName(name),
        revision: identity.revision,
        variationIdsMap: {},
        variationMap: {},
        variationNamesMap: {},
        variation_map: {},
        getAccountId: ( ) => identity.accountId,
        getProjectId: ( ) => identity.projectId,
    };
    for ( const name of [
        'activate', 'activateGeoDelayedExperiments', 'activateSiteCatalyst',
        'activateUniversalAnalytics', 'addOAuthClientId', 'addToAudience',
        'addToSegment', 'bindTrackElement', 'bucketUser', 'bucketVisitor',
        'clickTalePlayback', 'clickTaleRecord', 'customTag',
        'delayDomReadyEval', 'delayPageviewTracking', 'disable',
        'googleAnalyticsCustomVariableScope', 'integrationPrefix', 'log',
        'optOut', 'optOutThirdPartyCookies', 'overrideUrl',
        'removeFromAllAudiences', 'removeFromAllSegments',
        'removeFromAudience', 'removeFromReportableAudiences',
        'removeFromSegment', 'sc_activate', 'sc_svar', 'setDimensionValue',
        'setUserId', 'skipPageTracking', 'storeThirdPartyData', 'timeout',
        'trackEvent', 'verbose',
    ] ) {
        // In Classic the method and the pushed command are one function.
        classic[name] = hasOwn(commandsV0, name) ? commandsV0[name] : noop;
    }
    const api = {
        push,
        get,
        initialized: true,
        data: classicData,
        state: {},
    };
    for ( const name of Object.keys(classic) ) {
        api[name] = classic[name];
    }
    // Read at the time it is asked for, the same as get('jquery').
    try {
        Object.defineProperty(api, '$', {
            configurable: true, enumerable: true, get: ( ) => w.$,
        });
    } catch ( ex ) {
    }
    const queued = Array.isArray(existing) ? existing.slice() : [];
    w.optimizely = api;
    for ( const command of queued ) {
        push(command);
    }
    const fireLifecycle = ( ) => {
        emit({ type: 'lifecycle', name: 'initialized' });
        emit({ type: 'lifecycle', name: 'originsSynced' });
        emit({ type: 'lifecycle', name: 'activate' });
        emit({ type: 'lifecycle', name: 'activated' });
    };
    if ( doc.readyState === 'loading' ) {
        doc.addEventListener('DOMContentLoaded', fireLifecycle, { once: true });
    } else {
        w.setTimeout(fireLifecycle, 0);
    }
})();
