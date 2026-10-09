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
    // Their own cookie name, from Ar = Mt ? ed + "-" + Mt : ed, with
    // ed = "tcm" and Mt their loadOptions.partition. A partitioned tenant
    // reads tcm-<partition> and would never look at a plain tcm.
    const BASE_COOKIE = 'tcm';

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

    // Their loadOptions, installed by the same prelude that carries the
    // purposes, so these are readable without the engine having run.
    //
    // One read per option, each in its own try, because the object is
    // theirs: by the time the engine has booted, airgap is their own API
    // object behind their realm protection, and a read of a key it does not
    // hold can throw. An unguarded read used to take the whole refusal with
    // it - this function is called from inside their ready callback, which
    // is wrapped in a catch of its own, so setConsent was never reached and
    // nothing said so. Measured against an object that throws on an unknown
    // key: setConsent went from called to never called.
    const option = name => {
        try {
            const held = w.airgap.loadOptions;
            if ( held === null || typeof held !== 'object' ) { return undefined; }
            return held[name];
        } catch(ex) {
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
    // Five genuine ones, off five tenants - the first from Indiegogo:
    //
    //   {"purposes":{"SaleOfInfo":false,"Analytics":false,"Functional":false,
    //     "Advertising":false},"timestamp":"2026-10-02T01:33:15.268Z",
    //     "confirmed":true,"prompted":true,"updated":true}
    //   {"purposes":{"GcmAdvanced":"Auto",...},"updated":true}
    //   {"purposes":{...,"EnrichmentConsent":false,...},"updated":false}
    //   {"purposes":{"AlwaysBlock":"Auto",...},"updated":true}
    //   {"purposes":{"Functional":"Auto","BrowserCookies":false,
    //     "AdvertisingSaleOfInfo":false,...},"updated":true}
    //
    // confirmed and prompted are true in all five, and confirmed is the one
    // their engine gates the prompt on: its boot takes the stored record as
    // the answer where that is set and the record has not expired. updated
    // is not a gate and is not constant - four say true, one false - so it
    // stays false here, which is what it means for a record that replaced no
    // earlier decision. Their parser coerces it with !! and recomputes it.
    //
    // Those records also say which purposes theirs carries, and that is not
    // the same question as which this sets. Three of the five kept a purpose
    // at their tri-state Auto through a confirmed refusal - GcmAdvanced on
    // one, AlwaysBlock on another, and Functional on a third, which is a
    // purpose other tenants declare configurable, so it is the tenant's
    // choice rather than a class of purpose - and another carries
    // EnrichmentConsent, which that tenant declares not configurable, at
    // false. Their own
    // writer applies a value only where the purpose is configurable -
    //
    //   w(Be(d), $ => { (B = Te(Fn, $)) != null && B.configurable
    //       && (Yo[$] = d[$]) })
    //
    // - so a purpose of that kind sits in their record at whatever its
    // default resolved to, rather than because anything decided it. Asking
    // for every purpose to be off is theirs to filter and it filters it, so
    // a stored Auto after this has run is their engine declining to move
    // something, not the refusal failing. The record written here names only
    // the ones it is theirs to move, because their own boot merges the names
    // it finds and defaults the rest.
    const record = purposes => JSON.stringify({
        purposes,
        timestamp: new Date().toISOString(),
        confirmed: true,
        prompted: true,
        updated: false,
    });

    const cookieName = ( ) => {
        const partition = String(option('partition') || '');
        return partition !== ''
            ? BASE_COOKIE + '-' + partition
            : BASE_COOKIE;
    };

    const writeCookie = value => {
        const COOKIE = cookieName();
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

    let spoke = false;

    // WHERE THEIR RECORD ACTUALLY LIVES. Their persister writes two places,
    // and the cookie is the conditional one:
    //
    //   Hn = "tcm" + (Mt ? "MP" : "") + "Consent"      localStorage key
    //   Ar = Mt ? ed + "-" + Mt : ed                     cookie name, ed=tcm
    //   qa = Lv || RR && <the sites entry matching this host>
    //   Ai = xR !== "private-only"; Wv = Ai && xR !== "private"
    //   Zr = C && qa && Wv
    //   ...
    //   mt[Hn] = Mt && o || r;                           always
    //   if ( Zr ) { ... mu(i) }                           the cookie
    //
    // off their loadOptions { site: Lv, sites: RR, localSync: xR,
    // partition: Mt }. So a tenant that configures neither site nor a sites
    // entry matching the host it is on, or sets localSync to private, never
    // writes a tcm cookie at all and keeps the record in
    // localStorage.tcmConsent - which is also the only store their reader
    // looks at where localSync is private-only, because the cookie read is
    // behind that same Ai. Their own log line says which it used:
    //
    //   Consent read from cookie (tcm) | localStorage[tcmConsent]
    //
    // A refusal written to one store and not the other is therefore a
    // refusal a tenant may never read, so this writes both.
    const storageRecord = value => {
        const partition = String(option('partition') || '');
        const key = 'tcm' + (partition !== '' ? 'MP' : '') + 'Consent';
        let payload = value;
        if ( partition !== '' ) {
            // Theirs merges into whatever is there, by partition.
            let held = {};
            try {
                const raw = w.localStorage.getItem(key);
                if ( typeof raw === 'string' && raw !== '' ) {
                    const parsed = JSON.parse(raw);
                    if ( parsed !== null && typeof parsed === 'object' ) {
                        held = parsed;
                    }
                }
            } catch(ex) {
                held = {};
            }
            try {
                held[partition] = JSON.parse(value);
                payload = JSON.stringify(held);
            } catch(ex) {
                return false;
            }
        }
        try {
            w.localStorage.setItem(key, payload);
            return w.localStorage.getItem(key) === payload;
        } catch(ex) {
        }
        return false;
    };

    // Both stores, and the line says which took. Their cookie is skipped
    // where their own reader would not look at it.
    // Nothing in here may throw: it is called from inside their ready
    // callback and from an event handler, both of which swallow one, so a
    // throw would leave the refusal unrecorded and nothing said. Every piece
    // is guarded at its own source instead of wrapping the lot - option(),
    // storageRecord() and writeCookie() each catch their own - and the
    // purposes handed in are this resource's own object, so the stringify
    // cannot throw either. Keep it that way when adding to it.
    const store = purposes => {
        const value = record(purposes);
        const inStorage = storageRecord(value);
        const inCookie = String(option('localSync') || '') !== 'private-only'
            ? writeCookie(value)
            : false;
        if ( inCookie && inStorage ) { return 'cookie+storage'; }
        if ( inCookie ) { return 'cookie'; }
        if ( inStorage ) { return 'storage'; }
        return '';
    };

    const announce = (names, how) => {
        spoke = true;
        if ( typeof console !== 'object' ) { return; }
        if ( typeof console.info !== 'function' ) { return; }
        console.info(
            '[consent-rr] ' + NAME + ' ' + VERSION +
            ' refused=' + (names.length !== 0 ? names.join(',') : '(none)') +
            ' via=' + how
        );
    };

    let readied = false;

    const refuse = airgap => {
        readied = true;
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
        const authOff = option('requireAuth') === 'off';
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
                announce(names, store(refused) || 'refused');
            }, { once: true });
            return;
        }
        // Loaded already, so that event has been and gone: their own stores
        // are what is left, and they are read on the next page rather than
        // this one.
        announce(names, store(refused) || 'refused');
    };

    try {
        w.airgap.ready(refuse);
    } catch(ex) {
    }

    // Their engine is what takes the decision and what enforces it, and this
    // queues on it: nothing above runs until airgap.js arrives and drains the
    // queue it finds. Where it never arrives there is nothing to record a
    // refusal with - and nothing blocking anything either - so this says so,
    // because a resource that goes silent is the one outcome nobody can
    // debug. Two ways that happens, both reported from the field:
    //
    //   - a rule broad enough to catch every script on their CDN, which
    //     replaces airgap.js along with the banner.
    //   - airgap.js blocked outright by another list.
    //
    // A tenant that loads it late through a tag manager gets this line and
    // then the real one when it arrives, in that order.
    // What their prelude knows. The hand-written head of airgap.js runs
    // before the engine it carries, and it puts the tenant's purposes on the
    // object it merges:
    //
    //   self.airgap = Object.assign({ readyQueue: [], ready(c) {...},
    //     purposes: { useDefault: false, types: {
    //       Functional: { name, essential: false, configurable: true, ... },
    //       ... } } }, self.airgap);
    //
    // so where their engine is in the page but never becomes ready, the
    // names are still knowable from their own object and the refusal can go
    // in their cookie for the next page to read. Measured on a live tenant:
    // seven types, none essential, one of them not configurable.
    //
    // Which of them to turn off is read off their own boot rather than
    // judged. This is the set their isOptedOut reports on:
    //
    //   let M = T.configurable && !T.essential && (!nC || Ie(oo, d));
    //   ...
    //   M && (y(Wh, d), Z(Ou, d));
    //
    // configurable and not essential, which is also the pair their writer
    // enforces on the way in.
    const preludeRefusal = ( ) => {
        const out = {};
        let types;
        try {
            const held = w.airgap.purposes;
            if ( held === null || typeof held !== 'object' ) { return out; }
            types = held.types;
        } catch(ex) {
            return out;
        }
        if ( types === null || typeof types !== 'object' ) { return out; }
        for ( const name of Object.keys(types) ) {
            const entry = types[name];
            if ( entry === null || typeof entry !== 'object' ) { continue; }
            if ( entry.essential === true ) { continue; }
            if ( entry.configurable === false ) { continue; }
            out[name] = false;
        }
        return out;
    };

    const GRACE = 1000;
    const watch = ( ) => {
        if ( spoke ) { return; }
        // Their engine arriving and nothing being recorded is a different
        // fault from their engine never arriving, and saying the second
        // where the first happened sends the reader to the wrong place.
        const why = readied ? 'no record' : 'no engine';
        const refused = preludeRefusal();
        const names = Object.keys(refused);
        if ( names.length === 0 ) {
            announce(names, why);
            return;
        }
        const where = store(refused);
        announce(names, where !== '' ? where + ', ' + why : why);
    };
    try {
        if ( doc.readyState === 'complete' ) {
            w.setTimeout(watch, GRACE);
        } else {
            w.addEventListener('load', ( ) => {
                w.setTimeout(watch, GRACE);
            }, { once: true });
        }
    } catch(ex) {
    }
}
