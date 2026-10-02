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

    Stands in for CookieScript's per-site bundle, cdn.cookie-script.com/s/
    <hash>.js, which is the whole CMP: the banner, the auto-blocker, the
    tenant's configuration and the loader for their IAB SDK.

    Read off that bundle rather than from documentation:

      b() / Ke() / mn()         their three has-consent tests, and all that
                                any of them reads is action and categories:
                                b() is action "accept" or "reject", Ke() is
                                "accept", mn() is "accept" with every category
                                present. So the two fields this writes are a
                                complete decision to their own code. key is
                                not invented here: it comes back from their
                                collector (a('key', e.key)) and nothing of
                                theirs requires it.
      CookieScriptConsent       their cookie, plain JSON, written by
                                a(name, value) one field at a time -
                                  { action, categories, consenttime, key }
                                with categories a JSON string of its own. A
                                reject-all writes action "reject" and
                                categories "[]", and consenttime only where
                                their configuration carries one. The string is
                                what their reader wants: it does
                                JSON.parse(d('categories')) and falls back to
                                its own empty answer when that throws. One
                                real record, saved from their banner without
                                accepting, carries the bare array [] instead -
                                which their own reader cannot parse and so
                                falls back from. This writes the string.
      bannershown               in that record too, set to 1 where their code
                                put the banner up. It is left alone: they set
                                it on the branch for a visitor who has not
                                decided, and read it nowhere else, so with an
                                action already recorded nothing consults it.
                                Writing it would claim a banner was shown that
                                never was.
      a() / Cn()                their writer puts consenttime on the record
                                whenever action is written, from e.consentTime
                                - a literal in the bundle, so tenant config
                                rather than a clock. Cn() then reads it back:
                                a record whose consenttime is older than that
                                constant has the consent cookie removed, on
                                every domain and path they can reach. So a
                                guess at consenttime can undo the refusal it
                                came with, and this writes none - a record
                                without the field never reaches that branch.
      qt() and yt()             their two refusal paths, and they disagree on
                                the shape of categories: reject-all writes
                                JSON.stringify([]) and saving a selection with
                                nothing ticked writes a('categories', []).
                                Records off real sites carry the array, their
                                U() answers ['strict'] for both, and the array
                                is what this writes.
      oe()                      the end of both their refusal paths, qt() and
                                yt(): window.location.reload(), or the same
                                once their collector answers with the consent
                                key. Their decision reloads the page, and that
                                is not incidental - tags are parked in markup
                                rendered before any decision existed, and only
                                a fresh render with the record in place brings
                                them back unparked. Freeing elements in place
                                cannot reach a server-side integration that
                                reads the cookie. Reported from the field:
                                scrolling gone with this resource, fine after
                                a refresh, which is their own mechanism done
                                by hand.
      s(name, detail)           their dispatcher: a CustomEvent with bubbles
                                and cancelable set, dispatched on
                                window.document. A page hooks these with
                                document.addEventListener, which an event
                                dispatched at the window never reaches, so the
                                target is the whole point.
      p(category)               the per-category announcement their refusal
                                makes for strict: the name onto
                                instance.dispatchEventNames, out as the event
                                CookieScriptCategory-strict, and onto the data
                                layer.
      window.CookieScriptData   created by their bundle when absent, with
                                their defaults - a page reading a field off it
                                would otherwise throw.
      Mt()                      their teardown, run on every load before they
                                inject a banner: the stylesheet
                                style[data-type="cookiescriptstyles"] and the
                                markup [data-cs-id="cookiescript_injected"],
                                #cookiescript_injected_fsd and
                                #cookiescript_badge all come out. A page that
                                ships their banner in its own html relies on
                                it, and the full-screen one is position:fixed
                                over the viewport at z-index 999996 - left
                                there it takes the page's scrolling with it.
                                They inject a fresh banner afterwards; a
                                refusal injects nothing.
      the unblocker             one sweep over every parked kind, run from
                                Ve() at load and then once more 500ms later,
                                which is how an element that parsed after the
                                first pass still gets freed. There is no
                                observer. Each kind has its own attribute -
                                img and iframe src, embed src and reinserted,
                                object data and reinserted, link href, and a
                                script replaced by a fresh node - and
                                [data-cookienotice] whose categories are all
                                allowed is hidden.
      data-reload="true"        on a parked script, their flag for a page that
                                needs the ready event again: freeing one sets
                                their s, and s calls Vt(), which dispatches
                                DOMContentLoaded on the document a second
                                time. A script freed after the real event has
                                passed registers its listener too late to hear
                                it, so without this the page never finishes
                                setting itself up - its scrolling among the
                                rest. Reported from the field: scrolling gone
                                on a first visit, fine after a refresh, which
                                is the same script arriving from cache early
                                enough to catch the real event.
      the categories            functionality, targeting, strict, performance
                                and unclassified, with strict the one that is
                                never refused
      googleconsentmap          in the record, mapping each consent-mode key
                                to one of their categories - a real one reads
                                ad_storage: targeting, analytics_storage:
                                performance, functionality_storage,
                                personalization_storage and security_storage:
                                functionality. So which keys a refusal grants
                                is the tenant's mapping rather than a constant:
                                on that site even security_storage is theirs
                                to deny, because functionality is refused.
                                Where the record carries the map it is used;
                                where it does not, the fallback grants
                                security_storage alone and the console says it
                                was a default.
      j()                       the record's cookie name, which is the
                                data-cs-cookiename attribute off a script tag
                                where the tenant set one and
                                CookieScriptConsent otherwise. A redirected
                                script keeps its attributes in the document,
                                so both that and their we - the tenant hash in
                                the /s/<hash>.js url, which their hash() hands
                                back - are readable here.
      90 days, host minus www   their expiry and their cookie domain,
                                window.location.host.replace(/^www\./, "").
                                Both are their defaults: gt and ke are tenant
                                configuration, so a tenant that set a longer
                                expiry or a wider cookie domain gets the
                                default here. Neither is recoverable from the
                                page.
      their selectors           per tag, and theirs carry two conditions a
                                bare [data-cookiescript="accepted"] does not:
                                a script typed text/plain, and - once the
                                allowed list is non-empty, which a refusal
                                makes it - data-cookiecategory present at all.
                                Matching that exactly was tried and the field
                                answered: a page that worked stopped
                                scrolling, because the element it needs wears
                                no category. So the category rule decides
                                here, on its own. Nothing refused escapes
                                that way - a declared category has to be
                                strict, and unclassified, their own bucket for
                                a tracker they could not identify, is refused
                                like the rest. No category at all is not one
                                of their buckets; it is markup the site wrote
                                itself.
      Ve()                      runs the sweep and then once more 500ms
                                later, and it is called at load. On a real
                                page load is long past 500ms after their
                                script tag, so both pairs matter: one now and
                                one shortly after, then one at load and one
                                shortly after that.
      [data-cookiescript="accepted"]  what their auto-blocker parks, with the
                                real url in data-src and scripts typed
                                text/plain. Freeing one copies every attribute
                                onto a fresh element, sets the type back to
                                text/javascript and drops the marker.
      their category filter     an element is freed only when EVERY category
                                on it is allowed: they strip the allowed names
                                out of data-cookiecategory and skip it if
                                anything is left. So a tag marked
                                "strict targeting" stays parked.
      window.CookieScript       the instance, whose own method names are
                                currentState, expireDays, hash, show, hide,
                                showDetails, categories, acceptAllAction,
                                acceptAction, rejectAllAction, getCMPId and
                                the rest, with onAcceptAll, onAccept, onReject,
                                onClose and onChange as the callbacks
      cmpId 374                 their own, from getCMPId()
      CookieScriptConsentString the TC string, in localStorage. Their own text
                                says the TCF signal is only read when the
                                CookieScriptConsent cookie is there, which is
                                why this writes the cookie whatever happens
                                and the string only where a page shows sign of
                                TCF.
      navigator.doNotTrack      read, but only to report it to their collector
                                as &dnt= - never to decide anything. Nothing
                                is reported here.
      their reject-all path     Kt(): instance.onReject(), then the events
                                CookieScriptReject and
                                CookieScriptCurrentState carrying
                                currentState(), then the strict category freed
                                and CookieScriptConsentUpdated[strict] pushed.
                                CookieScriptAcceptAll is their accept-all
                                event and has no business firing here.

*/

function consentRRCookieScript() {
    const w = window;
    const doc = w.document;
    const VERSION = '@@VERSION@@';
    const NAME = 'cookiescript-reject';

    if ( w.CookieScript !== undefined && w.CookieScript !== null ) {
        if ( w.CookieScript.consentRR !== undefined ) { return; }
    }

    // Their j(): the record's cookie name comes off a script tag where the
    // tenant set one, and is CookieScriptConsent otherwise. Writing the
    // default name on a tenant that configured its own leaves a record
    // nothing reads.
    const cookieName = ( ) => {
        try {
            const tag = doc.querySelector('script[data-cs-cookiename]');
            if ( tag !== null ) {
                const name = tag.getAttribute('data-cs-cookiename');
                if ( name !== null && name !== '' ) { return name; }
            }
        } catch(ex) {
        }
        return 'CookieScriptConsent';
    };

    // Their we, the tenant's own hash, which their hash() hands back. A
    // redirected script keeps its original src attribute in the document, so
    // it is still readable here.
    const tenantHash = ( ) => {
        try {
            const tags = doc.querySelectorAll('script[src]');
            for ( const tag of Array.from(tags) ) {
                const match = /cookie-script\.com\/s\/([0-9a-f]{8,})\./.exec(
                    tag.getAttribute('src') || ''
                );
                if ( match !== null ) { return match[1]; }
            }
        } catch(ex) {
        }
        return '';
    };

    const COOKIE = cookieName();
    const TC_KEY = 'CookieScriptConsentString';
    const DAYS = 90;
    const STRICT = 'strict';
    const CATEGORIES = [
        'functionality', 'targeting', 'strict', 'performance', 'unclassified',
    ];

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

    // Their own domain rule, which is the host with a leading www dropped.
    const cookieDomain = ( ) => {
        try {
            return w.location.host.replace(/^www\./, '');
        } catch(ex) {
        }
        return '';
    };

    // Whether the visitor already carried a refusal before this ran, which
    // is what the reload below is gated on.
    let decided = false;

    // Their record, one field at a time as their a() builds it. Whatever was
    // already in it is kept: their key comes back from their collector, which
    // nothing here talks to.
    const record = ( ) => {
        let previous = {};
        try {
            const raw = readCookie(COOKIE);
            if ( typeof raw === 'string' && raw !== '' ) {
                const parsed = JSON.parse(decodeURIComponent(raw));
                if ( parsed !== null && typeof parsed === 'object' ) {
                    previous = parsed;
                }
            }
        } catch(ex) {
        }
        // Only a refusal already on the record makes the reload pointless: a
        // visitor who had accepted has a page rendered with its tags let
        // through, and their own oe() reloads on that change too.
        decided = previous.action === 'reject';
        previous.action = 'reject';
        // Their two refusal buttons write this field in two different shapes:
        // reject-all through qt() writes JSON.stringify([]), the string, and
        // saving a selection with nothing ticked goes through yt(), which
        // writes a('categories', []) - the bare array. Records off real sites
        // carry the array, and their own U() ends up at the same ['strict']
        // either way, so the array is what this writes: a page parsing the
        // record itself gets something it can iterate rather than a
        // two-character string.
        previous.categories = [];
        // In every refusal record from the field, and inert in their code:
        // they set it where the banner goes up and read it only on the branch
        // for a visitor who has not decided.
        previous.bannershown = 1;
        // consenttime and key are deliberately not invented. key is issued by
        // their collector, and consenttime is a tenant constant their Cn()
        // compares against: a record whose consenttime is older than the
        // tenant's configured consentTime has the whole consent cookie
        // deleted, so a guess at it can undo the refusal. Both are carried
        // forward where the visitor already has them.
        return previous;
    };

    const store = ( ) => {
        const next = record();
        const value = JSON.stringify(next).replace(/=/g, '%3D');
        const domain = cookieDomain();
        const expires = new Date(Date.now() + DAYS * 86400000).toUTCString();
        const secure = w.location.protocol === 'https:' ? '; secure' : '';
        const attributes = '; path=/; expires=' + expires + '; samesite=lax' +
            secure;
        try {
            if ( domain !== '' ) {
                doc.cookie = COOKIE + '=' + value + attributes +
                    '; domain=' + domain;
                if ( readCookie(COOKIE) === value ) {
                    return { how: 'written', record: next };
                }
            }
            doc.cookie = COOKIE + '=' + value + attributes;
            return {
                how: readCookie(COOKIE) === value ? 'written' : 'refused',
                record: next,
            };
        } catch(ex) {
        }
        return { how: 'refused', record: next };
    };

    const stored = store();

    // Their freeing routine, kind by kind: a fresh element carrying every
    // attribute, the type back to text/javascript, the marker gone.
    // Which attribute carries the parked url, by tag, and whether the element
    // has to go back into the document for it to take. All of it theirs: img
    // and iframe are src, embed is src and reinserted, object is data and
    // reinserted, link is href. A script is replaced by a fresh node, because
    // an attribute written onto one the parser has already been past does not
    // make it run.
    const HANDLERS = {
        IMG: { attribute: 'src', from: 'data-src' },
        IFRAME: { attribute: 'src', from: 'data-src' },
        EMBED: { attribute: 'src', from: 'data-src', reinsert: true },
        OBJECT: { attribute: 'data', from: 'data-data', reinsert: true },
        LINK: { attribute: 'href', from: 'data-href' },
    };

    // Their own reinsert: the markup goes in after the element, then the
    // element goes.
    const reinsert = element => {
        const html = element.outerHTML;
        element.insertAdjacentHTML('afterend', html);
        element.parentNode.removeChild(element);
    };

    const freeScript = element => {
        const fresh = doc.createElement('script');
        fresh.innerHTML = element.innerHTML;
        for ( const attribute of Array.from(element.attributes) ) {
            fresh.setAttribute(attribute.name, attribute.value);
        }
        fresh.setAttribute('type', 'text/javascript');
        fresh.removeAttribute('data-cookiescript');
        // Theirs parks a script by its type alone, so src comes over with the
        // other attributes. A tenant that parks the url too is handled as
        // well.
        const src = element.getAttribute('data-src');
        if ( src ) {
            fresh.setAttribute('src', src);
            fresh.removeAttribute('data-src');
        }
        // A script node inserted by script runs async by default, which for
        // two freed scripts that depend on each other is a race. Theirs frees
        // at load, where the page has already given up on order; these are
        // freed as they parse, in document order, so the order is kept.
        fresh.async = false;
        element.parentNode.replaceChild(fresh, element);
        // Their flag for a script whose page needs the ready event again.
        return element.getAttribute('data-reload') === 'true';
    };

    // null where nothing was freed, otherwise whether the page asked for the
    // ready event along with it.
    const free = element => {
        try {
            if ( element.tagName === 'SCRIPT' ) {
                return freeScript(element);
            }
            // The six tags they park get the attribute theirs uses for that
            // tag. Any other tag wearing the marker gets freed by whichever
            // of the two url attributes it carries, since their blocker is
            // not the only thing that writes this markup.
            const handler = HANDLERS[element.tagName];
            const from = handler !== undefined ? handler.from : 'data-src';
            const attribute = handler !== undefined ? handler.attribute : 'src';
            const url = element.getAttribute(from);
            if ( url ) {
                element.setAttribute(attribute, url);
                element.removeAttribute(from);
            }
            if ( handler === undefined ) {
                const href = element.getAttribute('data-href');
                if ( href ) {
                    element.setAttribute('href', href);
                    element.removeAttribute('data-href');
                }
            }
            element.removeAttribute('data-cookiescript');
            if ( handler !== undefined && handler.reinsert === true ) {
                reinsert(element);
            }
            return false;
        } catch(ex) {
        }
        return null;
    };

    // Only where every category on the element is allowed, which is their own
    // test: they strip the allowed names and skip anything left over.
    const allowed = value => {
        if ( value === null || value === '' ) { return true; }
        return value.split(STRICT).join('').trim() === '';
    };

    // Their Mt(), which runs on every load before they inject anything: the
    // stylesheet and the banner markup they may already find on the page come
    // out. A page that ships their banner in its own HTML - server-rendered,
    // or served from a cache - therefore relies on this, and the full-screen
    // one is position:fixed over the whole viewport at z-index 999996, so
    // left in place it takes the page's scrolling with it. They then inject a
    // fresh banner; a refusal injects nothing.
    const THEIRS = [
        'style[data-type="cookiescriptstyles"]',
        '[data-cs-id="cookiescript_injected"]',
        '#cookiescript_injected',
        '#cookiescript_injected_fsd',
        '#cookiescript_badge',
    ];

    const removeTheirs = ( ) => {
        let removed = 0;
        for ( const selector of THEIRS ) {
            try {
                for ( const element of Array.from(doc.querySelectorAll(selector)) ) {
                    element.parentNode.removeChild(element);
                    removed += 1;
                }
            } catch(ex) {
            }
        }
        // Their overlay class, which is what their stylesheet hangs
        // overflow: hidden and height: 100vh on. The stylesheet above is
        // normally what makes it bite, but a page carrying its own copy of
        // their css would stay locked without this.
        try {
            for ( const element of [ doc.documentElement, doc.body ] ) {
                if ( element === null ) { continue; }
                if ( element.classList.contains('cookiescript_overlay') === false ) {
                    continue;
                }
                element.classList.remove('cookiescript_overlay');
                removed += 1;
            }
        } catch(ex) {
        }
        return removed;
    };

    // Everything wearing their marker, whatever tag it is and whether or not
    // it declares a category.
    //
    // Their refusal path reaches the unblocker as k(['strict']), and with a
    // non-empty list their selector becomes
    // [data-cookiescript="accepted"][data-cookiecategory] - the attribute has
    // to be there - and their script selector also wants type="text/plain".
    // Matching that exactly is what the previous release did, and the field
    // answered: a page that worked went back to not scrolling, because the
    // element it needed carries no category and so stopped being freed.
    //
    // So this frees on the category rule alone. Nothing refused gets out that
    // way: a declared category has to be strict, and unclassified - their own
    // bucket for a tracker they could not identify - is refused like any
    // other. An element with no category at all is not in any of their
    // buckets; it is markup the site wrote itself, and freeing it is what
    // makes those pages work.
    const PARKED = '[data-cookiescript="accepted"]';

    // What the watch below frees, which the console line reports.
    let observed = 0;

    const sweep = ( ) => {
        let freed = 0;
        let reload = false;
        let removed = removeTheirs();
        try {
            const parked = doc.querySelectorAll(PARKED);
            for ( const element of Array.from(parked) ) {
                const categories = element.getAttribute('data-cookiecategory');
                if ( allowed(categories) === false ) { continue; }
                const asked = free(element);
                if ( asked === null ) { continue; }
                freed += 1;
                if ( asked ) { reload = true; }
            }
            // Their last handler: a notice about a category that is allowed
            // has nothing left to say.
            const notices = doc.querySelectorAll('[data-cookienotice]');
            for ( const element of Array.from(notices) ) {
                if ( allowed(element.getAttribute('data-cookienotice')) === false ) {
                    continue;
                }
                element.style.display = 'none';
            }
        } catch(ex) {
        }
        return { freed, reload, removed };
    };

    // Their ready event, dispatched again on a document that has had one
    // already. A script freed after the real event went past registers its
    // listener too late to ever hear it, and their data-reload flag is what a
    // page marks such a script with - page scrolling being routinely one of
    // the things that listener sets up. Deferred while the document is still
    // parsing, so the real event goes first.
    const announceReady = ( ) => {
        const dispatch = ( ) => {
            try {
                doc.dispatchEvent(new w.Event('DOMContentLoaded', {
                    bubbles: true,
                    cancelable: true,
                }));
            } catch(ex) {
            }
        };
        if ( doc.readyState === 'loading' ) {
            doc.addEventListener('DOMContentLoaded', dispatch, { once: true });
            return;
        }
        dispatch();
    };

    // Theirs sweeps at load and then once more half a second later, which is
    // how an element that parsed after it still gets freed. This sweeps now
    // for whatever is already there, and then on their schedule, because at
    // the point their script tag is reached the rest of the page is not.
    const sweepLater = ( ) => {
        const pass = sweep();
        if ( pass.freed === 0 && pass.removed === 0 ) { return; }
        if ( pass.reload ) { announceReady(); }
        try {
            w.console.info(
                '[consent-rr] ' + NAME + ' ' + VERSION +
                ' freed=+' + pass.freed +
                ' removed=+' + pass.removed +
                ' ready=' + (pass.reload ? 'redispatched' : 'unchanged')
            );
        } catch(ex) {
        }
    };

    const first = sweep();
    const freed = first.freed;
    const removed = first.removed;
    if ( first.reload ) { announceReady(); }

    // Theirs has no observer: it sweeps at load, and a decision made on the
    // page is followed by oe(), a reload, which is what gets a parked tag
    // running in the position the page expects. Reloading from here means
    // reloading before anything has painted, which the field showed for what
    // it is - the page visibly breaking first.
    //
    // Freeing each parked element as it parses gets to the same place without
    // that: a script freed while the document is still being built has the
    // best chance of running before the ready event, which is what a page's
    // own setup waits for, where one freed at load has none.
    const watch = ( ) => {
        if ( typeof w.MutationObserver !== 'function' ) { return 'nowatch'; }
        let observer = null;
        const take = element => {
            if ( allowed(element.getAttribute('data-cookiecategory')) === false ) {
                return;
            }
            const asked = free(element);
            if ( asked === null ) { return; }
            observed += 1;
            if ( asked ) { announceReady(); }
        };
        const onMutation = records => {
            for ( const mutation of records ) {
                for ( const node of Array.from(mutation.addedNodes) ) {
                    if ( node.nodeType !== 1 ) { continue; }
                    try {
                        if ( node.matches(PARKED) ) { take(node); }
                        for ( const found of Array.from(node.querySelectorAll(PARKED)) ) {
                            take(found);
                        }
                    } catch(ex) {
                    }
                }
            }
        };
        try {
            observer = new w.MutationObserver(onMutation);
            observer.observe(doc.documentElement || doc, {
                childList: true,
                subtree: true,
            });
        } catch(ex) {
            return 'nowatch';
        }
        // Their last sweep is 500ms after load, so the watch is no longer
        // needed once that has been and gone.
        const stop = ( ) => {
            try {
                w.setTimeout(( ) => {
                    try { observer.disconnect(); } catch(ex) {}
                }, 600);
            } catch(ex) {
            }
        };
        try {
            if ( doc.readyState === 'complete' ) { stop(); }
            else { w.addEventListener('load', stop, { once: true }); }
        } catch(ex) {
        }
        return 'watching';
    };

    const observing = watch();

    try {
        if ( doc.readyState === 'loading' ) {
            doc.addEventListener('DOMContentLoaded', sweepLater, { once: true });
        }
        if ( doc.readyState !== 'complete' ) {
            w.addEventListener('load', ( ) => {
                sweepLater();
                // Their Ve() runs the sweep and then once more 500ms later,
                // so a tag injected just after load is still caught.
                try { w.setTimeout(sweepLater, 500); } catch(ex) {}
            }, { once: true });
        }
        w.setTimeout(sweepLater, 500);
    } catch(ex) {
    }

    // Their consent-mode keys, with the category each is mapped to where the
    // record says so. A key is granted only where its category survives a
    // refusal, which is strict and nothing else.
    const DEFAULT_GCM = {
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        analytics_storage: 'denied',
        functionality_storage: 'denied',
        personalization_storage: 'denied',
        security_storage: 'granted',
    };

    const consentMode = ( ) => {
        const map = stored.record.googleconsentmap;
        if ( map === null || typeof map !== 'object' ) {
            return { state: DEFAULT_GCM, from: 'default' };
        }
        const state = {};
        let keys = 0;
        for ( const key of Object.keys(map) ) {
            state[key] = map[key] === STRICT ? 'granted' : 'denied';
            keys += 1;
        }
        if ( keys === 0 ) { return { state: DEFAULT_GCM, from: 'default' }; }
        return { state, from: 'theirs' };
    };

    // Their data-layer events, with the one category that survives a refusal.
    const pushEvents = ( ) => {
        const mode = consentMode();
        try {
            if ( Array.isArray(w.dataLayer) === false ) { w.dataLayer = []; }
            w.dataLayer.push({ event: 'CookieScriptConsentUpdated[strict]' });
            if ( typeof w.gtag === 'function' ) {
                w.gtag('consent', 'update', mode.state);
                w.dataLayer.push({ event: 'CookieScriptGoogleConsentUpdated' });
                return 'denied/' + mode.from;
            }
            return 'nogtag';
        } catch(ex) {
        }
        return 'refused';
    };

    const pushed = pushEvents();

    const noop = ( ) => undefined;

    // Their own currentState, field for field: action off the record, key
    // only where the record carries one, and categories from their U(), which
    // parses the stored string and then adds strict - so their state after a
    // refusal is ['strict'], not []. A page asking the instance what is
    // allowed has to be told the same thing.
    const state = ( ) => {
        const answer = { action: 'reject' };
        const key = stored.record.key;
        if ( key ) { answer.key = key; }
        const categories = [];
        // Their U() parses the stored value, which is what this writes an
        // array into - exactly as their own yt() does - so the parse throws
        // and the answer is strict alone, theirs for theirs. The catch is
        // load-bearing for that reason.
        try {
            const parsed = JSON.parse(stored.record.categories);
            if ( Array.isArray(parsed) ) {
                for ( const name of parsed ) {
                    if ( name !== '' && categories.indexOf(name) === -1 ) {
                        categories.push(name);
                    }
                }
            }
        } catch(ex) {
        }
        if ( categories.indexOf(STRICT) === -1 ) { categories.push(STRICT); }
        answer.categories = categories;
        return answer;
    };

    // Their instance, under their own method names. The ones that would show
    // the banner or record a decision do neither.
    const instance = {
        consentRR: VERSION,
        // Theirs is a build number, which page code compares against. The
        // most recent one seen in a served bundle is the floor: zero would
        // fail every "at least this build" test a page makes.
        version: 20260210,
        currentState: ( ) => state(),
        expireDays: ( ) => DAYS,
        hash: ( ) => tenantHash(),
        categories: ( ) => CATEGORIES.slice(),
        show: noop,
        hide: noop,
        showDetails: noop,
        showIABSpecificTab: noop,
        acceptAllAction: noop,
        acceptAction: noop,
        rejectAllAction: noop,
        getCMPId: ( ) => 374,
        getIABSdkUrl: ( ) => '',
        getIABVendorsIds: ( ) => [],
        getGoogleVendorsIds: ( ) => [],
        getIABLegIntPurposes: ( ) => [],
        getLanguagesKeys: ( ) => [],
        getCMPCookie: ( ) => {
            try {
                return w.localStorage.getItem(TC_KEY) || '';
            } catch(ex) {
            }
            return '';
        },
        setCMPCookie: noop,
        getGoogleACStringCookie: ( ) => '',
        setGoogleACStringCookie: noop,
        // Theirs hands back name=value for carrying the record across
        // domains, from the cookie name their j() resolved.
        getCookieValueForQueryArg: ( ) => {
            try {
                const value = readCookie(COOKIE);
                if ( value ) {
                    return COOKIE + '=' + encodeURIComponent(value);
                }
            } catch(ex) {
            }
            return '';
        },
        getGeoTargeting: ( ) => '',
        isCdn: ( ) => true,
        applyTranslation: noop,
        applyTranslationByCode: noop,
        applyCurrentCookiesState: noop,
        forceDispatchCSLoadEvent: noop,
        onAcceptAll: noop,
        onAccept: noop,
        onReject: noop,
        onClose: noop,
        onChange: noop,
        // Their own instance fields, which page code reads.
        dispatchEventNames: [],
        currentLang: null,
        iabCMP: null,
        tcString: undefined,
        googleAcString: undefined,
    };

    let installed = false;
    try {
        const previous = w.CookieScript;
        // Theirs, created the same way they create it, with their defaults:
        // a page reading a field off it would otherwise throw.
        if ( !w.CookieScriptData ) {
            w.CookieScriptData = {
                enabledConsentMode: false,
                useGoogleTemplate: false,
                correctGoogleTemplateTrigger: false,
                gtagRequiredCategory: null,
                gtagCorrectOrder: null,
                gtagDefaultConsent: null,
                isVerifyGoogleConsentMode: false,
            };
        }
        w.CookieScript = Object.assign(
            typeof previous === 'object' && previous !== null ? previous : {},
            { consentRR: VERSION, instance }
        );
        installed = w.CookieScript.instance === instance;
    } catch(ex) {
    }

    // Their s(name, detail), which dispatches on the document and bubbles.
    // An event dispatched at the window instead never reaches a
    // document.addEventListener, which is how a page hooks them, so it would
    // be heard by nobody.
    const fire = (name, detail) => {
        try {
            w.document.dispatchEvent(new w.CustomEvent(name, {
                bubbles: true,
                cancelable: true,
                detail,
            }));
        } catch(ex) {
        }
    };

    // Their load event, which goes out as soon as they are there.
    fire('CookieScriptLoaded');

    // The rest is their reject-all path, in their order - the callback the
    // page may have set, then the refusal, then the state. It waits a tick:
    // a page assigns CookieScript.instance.onReject in the script after
    // theirs, which has not run yet at this point.
    const announce = ( ) => {
        try {
            if ( typeof instance.onReject === 'function' ) {
                instance.onReject();
            }
        } catch(ex) {
        }
        fire('CookieScriptReject');
        fire('CookieScriptCurrentState', instance.currentState());
        // Their p(category), which their refusal calls for strict: the name
        // goes on the instance, out as an event, and onto the data layer.
        const name = 'CookieScriptCategory-' + STRICT;
        if ( instance.dispatchEventNames.indexOf(name) === -1 ) {
            instance.dispatchEventNames.push(name);
            fire(name);
            try {
                if ( Array.isArray(w.dataLayer) === false ) { w.dataLayer = []; }
                w.dataLayer.push({ event: name });
            } catch(ex) {
            }
        }
    };
    try {
        w.setTimeout(announce, 0);
    } catch(ex) {
        announce();
    }

    // The watch above frees a parked tag as it parses, which is the earlier
    // and quieter of the two ways to get one running in the position the page
    // expects. This is the other one, and it is theirs.
    //
    // Their own refusal ends in oe(), which reloads the page - either at once
    // or, where they are waiting on their collector for the consent key, when
    // that comes back. Both of their refusal paths, qt() and yt(), call it.
    // That is the whole point of it: tags are parked before a decision
    // exists, and a page rendered again with the record in place comes back
    // unparked, which freeing elements in place cannot do - a server-side
    // integration reading the cookie is never reached otherwise.
    //
    // So this reloads once, and only where that is both needed and safe:
    //   - the visitor had no decision before this ran, so a returning
    //     refusal never reloads anything
    //   - the record verifiably landed, or a reload would come straight back
    //     to the same state and go round again
    //   - the top document, so an embedded frame is not reloaded under its
    //     page
    //   - and a marker in session storage, so even a record that will not
    //     persist costs one reload rather than a loop
    const RELOADED = 'consent-rr-cookiescript';
    // How long the document stays hidden before it comes back whatever
    // happened, so a navigation that never commits cannot leave it blank.
    const BLANK_FOR = 2000;

    // A reload asked for while the document is still parsing cancels the
    // stylesheet it had not finished fetching, so the first document goes on
    // parsing and paints without its css until the new one commits - the page
    // visibly breaking before it refreshes, which is what the field saw.
    // Theirs never shows that: theirs reloads from a click on a page already
    // rendered and styled. This runs before anything has painted, so hiding
    // the document here means none of the first one is ever shown. The timer
    // is the backstop: if the navigation does not happen, the page comes back
    // rather than staying blank.
    const hideUntilItGoes = ( ) => {
        const root = doc.documentElement;
        if ( root === null ) { return false; }
        let was = '';
        try {
            was = root.style.visibility;
            root.style.visibility = 'hidden';
        } catch(ex) {
            return false;
        }
        try {
            w.setTimeout(( ) => {
                try {
                    if ( root.style.visibility === 'hidden' ) {
                        root.style.visibility = was;
                    }
                } catch(ex) {
                }
            }, BLANK_FOR);
        } catch(ex) {
        }
        return true;
    };

    const reload = ( ) => {
        if ( decided ) { return 'had'; }
        try {
            if ( w.top !== w.self ) { return 'framed'; }
        } catch(ex) {
            return 'framed';
        }
        if ( stored.how !== 'written' ) { return 'nocookie'; }
        try {
            if ( w.sessionStorage.getItem(RELOADED) !== null ) { return 'done'; }
            w.sessionStorage.setItem(RELOADED, '1');
        } catch(ex) {
        }
        const hidden = hideUntilItGoes();
        try {
            w.location.reload();
            return hidden ? 'reloading' : 'reloading/shown';
        } catch(ex) {
        }
        return 'refused';
    };

    const reloading = reload();

    try {
        w.console.info(
            '[consent-rr] ' + NAME + ' ' + VERSION +
            ' action=reject categories=' + state().categories.join(',') +
            ' cookie=' + stored.how +
            ' freed=' + freed +
            ' removed=' + removed +
            ' gcm=' + pushed +
            ' api=' + (installed ? 'ready' : 'refused') +
            ' watch=' + observing +
            ' reload=' + reloading
        );
    } catch(ex) {
    }
}
