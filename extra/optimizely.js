/// optimizely.js
// Resource replacement for Optimizely Web Experimentation snippets served
// from cdn.optimizely.com/js/<projectId>.js
// Not a cookie-consent resource: it lives outside src/ and is not built
// into dist/ by tools/build.mjs. Hand-maintained, ship as-is.
// The page keeps a working window.optimizely - push, get, initialized and
// the lifecycle listeners - so code that queues commands or waits on the
// client proceeds. What it loses is everything the real client does with
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
    const projectIdFromScript = ( ) => {
        try {
            const el = doc.currentScript;
            const src = el && el.src || '';
            const match = /\/(\d{6,})\.js/.exec(src);
            return match !== null ? match[1] : null;
        } catch ( ex ) {
            return null;
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
    const scanObservers = ( ) => {
        for ( let i = observers.length - 1; i >= 0; i-- ) {
            const entry = observers[i];
            let nodes;
            try {
                nodes = doc.querySelectorAll(entry.selector);
            } catch ( ex ) {
                observers.splice(i, 1);
                continue;
            }
            for ( const node of nodes ) {
                if ( entry.seen.has(node) ) { continue; }
                entry.seen.add(node);
                try {
                    entry.callback(node);
                } catch ( ex ) {
                }
                if ( entry.once ) {
                    observers.splice(i, 1);
                    break;
                }
            }
        }
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
        scanObservers();
        return ( ) => {
            const i = observers.indexOf(entry);
            if ( i !== -1 ) { observers.splice(i, 1); }
        };
    };
    const poll = (callback, interval) => {
        if ( typeof interval !== 'number' ) { interval = POLL_INTERVAL; }
        const id = w.setInterval(( ) => {
            try {
                callback();
            } catch ( ex ) {
            }
        }, interval);
        return ( ) => { w.clearInterval(id); };
    };
    const waitUntil = condition => new Promise(resolve => {
        if ( typeof condition !== 'function' ) { return; }
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
    let historyPatched = false;
    let nativePushState = null;
    let nativeReplaceState = null;
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
            if ( historyPatched === false ) {
                nativePushState = w.history.pushState;
                nativeReplaceState = w.history.replaceState;
                w.history.pushState = function() {
                    nativePushState.apply(w.history, arguments);
                    notifyUrlChange();
                };
                w.history.replaceState = function() {
                    nativeReplaceState.apply(w.history, arguments);
                    notifyUrlChange();
                };
                historyPatched = true;
            }
        }
        return ( ) => {
            urlChangeHandlers.delete(token);
            if ( urlChangeHandlers.size !== 0 ) { return; }
            w.removeEventListener('popstate', notifyUrlChange);
            w.removeEventListener('hashchange', notifyUrlChange);
            if ( historyPatched ) {
                w.history.pushState = nativePushState;
                w.history.replaceState = nativeReplaceState;
                historyPatched = false;
            }
        };
    };
    const PLACEMENTS = {
        before: 'beforebegin',
        after: 'afterend',
        first_child: 'afterbegin',
        last_child: 'beforeend',
    };
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
    const projectId = projectIdFromScript();
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
        accountId: null,
        audiences: {},
        campaigns: {},
        clientName: CLIENT_NAME,
        clientVersion: CLIENT_VERSION,
        dcpServiceId: null,
        events: {},
        experiments: {},
        groups: {},
        pages: {},
        projectId,
        revision: null,
        snippetId: projectId,
        variations: {},
    };
    const visitor = {
        campaigns: {},
        custom: {},
        dimensions: {},
        events: [],
        lineItems: [],
        offset: 0,
        referrer: '',
        source_type: 'direct',
        visitorId: null,
    };
    const utils = {
        observeSelector,
        onUrlChange,
        persistHtml,
        poll,
        Promise: w.Promise,
        waitForElement,
        waitUntil,
    };
    const modules = {
        data,
        state,
        utils,
        visitor,
        visitor_id: { randomId: randomId() },
    };
    const get = name => {
        if ( name === 'jquery' ) { return w.jQuery; }
        return hasOwn(modules, name) ? modules[name] : undefined;
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
    const addListener = spec => {
        if ( spec === null || typeof spec !== 'object' || typeof spec.handler !== 'function' ) {
            throw new Error('A handler function must be supplied');
        }
        const entry = { filter: spec.filter, handler: spec.handler, token: spec.token };
        listeners.push(entry);
        const filter = spec.filter;
        if ( !filter || filter.type !== 'lifecycle' ) { return; }
        if ( STICKY[filter.name] !== true || fired[filter.name] !== true ) { return; }
        try {
            entry.handler({ type: 'lifecycle', name: filter.name });
        } catch ( ex ) {
        }
    };
    const removeListener = spec => {
        if ( spec === null || typeof spec !== 'object' || !spec.token ) {
            throw new Error('Must supply a token to removeListener');
        }
        for ( let i = listeners.length - 1; i >= 0; i-- ) {
            if ( listeners[i].token === spec.token ) { listeners.splice(i, 1); }
        }
    };
    const noop = ( ) => { };
    const commands = {
        activate: noop,
        addListener,
        bucketVisitor: noop,
        dataFromSource: noop,
        disable: noop,
        event: noop,
        holdEvents: noop,
        integrationSettings: noop,
        load: noop,
        log: noop,
        optOut: noop,
        page: noop,
        registerModule: noop,
        removeListener,
        sendEvents: noop,
        setOptOut: noop,
        trackEvent: noop,
        user: noop,
    };
    const push = command => {
        let name;
        let args;
        if ( Array.isArray(command) ) {
            name = command[0];
            args = command.slice(1);
        } else if ( command !== null && typeof command === 'object' ) {
            name = command.type;
            args = [ command ];
        } else if ( typeof command === 'string' ) {
            name = command;
            args = [];
        } else {
            return false;
        }
        if ( hasOwn(commands, name) === false ) { return false; }
        try {
            commands[name].apply(null, args);
        } catch ( ex ) {
        }
        return true;
    };
    const api = {
        push,
        get,
        initialized: true,
        data: { note: "Obsolete, use optimizely.get('data') instead" },
        state: {},
    };
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
