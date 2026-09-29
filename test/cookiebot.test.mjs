/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

*/

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import {
    cookies, filtersText, loadResources, runDom, settle, versions,
} from './helpers.mjs';

const URL = 'https://www.asket.com/collection';

// A site's tag as Cookiebot's own installation puts it, carrying the
// configuration this reads, plus tags parked the two ways they park them.
const PAGE = '<html lang="en"><head>' +
    '<script id="Cookiebot" data-cbid="df50ecbc-61eb-4c83-9bde-3ac95023ce42"' +
    ' data-blockingmode="auto"></' + 'script>' +
    '<script id="nec" type="text/plain" data-cookieconsent="necessary"' +
    ' src="https://n.example/n.js"></' + 'script>' +
    '<script id="stat" type="text/plain" data-cookieconsent="statistics"' +
    ' src="https://s.example/s.js"></' + 'script>' +
    '<script id="ignored" type="text/plain" data-cookieconsent="ignore"' +
    ' src="https://i.example/i.js"></' + 'script>' +
    '</head><body>' +
    '<iframe id="yt" data-cookieconsent="marketing"' +
    ' data-cookieblock-src="https://www.youtube.com/embed/x"></iframe>' +
    '<img id="px" data-cookieconsent="statistics" data-src="https://p.example/p.gif">' +
    '<img id="nec-img" data-cookieconsent="necessary" data-src="https://n.example/n.gif">' +
    '<img id="ignored-img" data-cookieconsent="ignore" data-src="https://i.example/i.gif">' +
    '<p id="content">x</p></body></html>';

let reject;

before(async ( ) => {
    reject = (await loadResources()).get('cookiebot-reject.js');
});

const plain = value => JSON.parse(JSON.stringify(value));

const open = (options = {}) => runDom(
    reject, options.url || URL, options.html || PAGE, w => {
        if ( typeof options.before === 'function' ) { options.before(w); }
    }
);

// Their own reader: unescape, quote the bare keys, turn the single quotes into
// double ones, then JSON.parse.
const theirParse = w => {
    const raw = cookies(w).get('CookieConsent');
    const text = unescape(raw);
    return JSON.parse(
        text.replace(/%2c/g, ',')
            .replace(/'/g, '"')
            .replace(/([{\[,])\s*([a-zA-Z0-9_]+?):/g, '$1"$2":')
    );
};

const lines = w => {
    const out = [];
    w.console.info = line => { out.push(line); };
    return out;
};

/******************************************************************************/

describe('cookiebot-reject', ( ) => {
    it('ships as one resource, in the format uBO parses', async ( ) => {
        const names = Array.from((await loadResources()).keys())
            .filter(name => name.startsWith('cookiebot-'));
        assert.deepEqual(names, [ 'cookiebot-reject.js' ]);
        assert.equal(/^[ \t]*$/m.test(reject), false);
        assert.equal(/[^\x20-\x7e\t\n]/.test(reject), false);
        assert.ok(reject.includes("const VERSION = '" + versions.cookiebot + "'"));
    });

    it('answers as their own default state does: necessary and no more', ( ) => {
        const w = open().window;
        // Both names, and the same object, as theirs are.
        assert.equal(typeof w.CookieConsent, 'object');
        assert.equal(w.Cookiebot, w.CookieConsent);
        assert.deepEqual(plain(w.Cookiebot.consent), {
            stamp: '0',
            necessary: true,
            preferences: false,
            statistics: false,
            marketing: false,
            method: 'explicit',
        });
        assert.equal(w.Cookiebot.consented, false);
        assert.equal(w.Cookiebot.declined, true);
        // What stops the banner being built at all.
        assert.equal(w.Cookiebot.hasResponse, true);
        assert.equal(w.Cookiebot.responseMode, 'leveloptin');
    });

    it('writes the cookie in the shape their own reader takes', ( ) => {
        const w = open().window;
        const raw = cookies(w).get('CookieConsent');
        // Theirs writes the quotes and commas already escaped, and unescapes on
        // the way back in.
        assert.ok(raw.startsWith('{stamp:%27'), raw.slice(0, 30));
        assert.ok(raw.includes('%2Cnecessary:true%2Cpreferences:false'));
        assert.ok(raw.includes('%2Cmethod:%27explicit%27%2Cver:1%2Cutc:'));
        const theirs = theirParse(w);
        assert.equal(theirs.necessary, true);
        assert.equal(theirs.preferences, false);
        assert.equal(theirs.statistics, false);
        assert.equal(theirs.marketing, false);
        assert.equal(theirs.method, 'explicit');
        assert.equal(theirs.ver, 1);
        assert.ok(theirs.utc > 0);
        // Which is the test their own code makes to call it declined.
        assert.equal(
            theirs.preferences || theirs.statistics || theirs.marketing,
            false
        );
    });

    it('keeps a stamp already issued, and stands in for one it cannot be', ( ) => {
        const fresh = open().window;
        // Their own placeholder: the real stamp is a hash their server issues.
        assert.equal(theirParse(fresh).stamp, '0');
        const kept = open({
            before: w => {
                w.document.cookie = 'CookieConsent={stamp:%27AlnxYqDy4pdJ%27' +
                    '%2Cnecessary:true%2Cpreferences:true%2Cstatistics:false' +
                    '%2Cmarketing:false%2Cmethod:%27explicit%27%2Cver:1' +
                    '%2Cutc:1790663897796%2Cregion:%27gb%27}; path=/';
            },
        }).window;
        assert.equal(theirParse(kept).stamp, 'AlnxYqDy4pdJ');
        assert.equal(kept.Cookiebot.consentID, 'AlnxYqDy4pdJ');
        // And the decision is this resource's, not the one that was stored.
        assert.equal(theirParse(kept).preferences, false);
    });

    it('names the region only where the site says which it is', ( ) => {
        assert.equal(cookies(open().window).get('CookieConsent').includes('region'), false);
        const known = open({
            html: PAGE.replace('data-blockingmode="auto"',
                'data-blockingmode="auto" data-user-country="GB"'),
        }).window;
        assert.equal(theirParse(known).region, 'gb');
        assert.equal(known.Cookiebot.userCountry, 'gb');
    });

    it('frees a tag that needs nothing and parks the rest', async ( ) => {
        const w = open().window;
        await settle(30);
        const doc = w.document;
        // Only preferences, statistics and marketing are checked, so one marked
        // necessary runs - as it does with their own script.
        assert.equal(
            doc.querySelectorAll('script[src="https://n.example/n.js"]').length,
            2
        );
        assert.equal(doc.getElementById('nec-img').getAttribute('src'),
            'https://n.example/n.gif');
        // And everything behind a refused category stays as it was.
        assert.equal(doc.getElementById('stat').type, 'text/plain');
        assert.equal(
            doc.querySelectorAll('script[src="https://s.example/s.js"]').length,
            1
        );
        assert.equal(doc.getElementById('px').getAttribute('src'), null);
        assert.equal(doc.getElementById('yt').getAttribute('src'), null);
        assert.ok(doc.getElementById('yt').hasAttribute('data-cookieblock-src'));
        // Their own opt-in classes go on either way.
        assert.ok(doc.getElementById('px').className
            .includes('cookieconsent-optin-statistics'));
        assert.ok(doc.getElementById('yt').className
            .includes('cookieconsent-optin-marketing'));
        // A tag marked ignore is not theirs to touch - and the original stays
        // text/plain whatever happens, so what says so is that no live copy of
        // it was made.
        assert.equal(doc.getElementById('ignored').type, 'text/plain');
        assert.equal(
            doc.querySelectorAll('script[src="https://i.example/i.js"]').length,
            1
        );
        assert.equal(doc.getElementById('ignored-img').getAttribute('src'), null);
    });

    it('takes a setting from their script url as theirs does', ( ) => {
        // Their own getURLParam reads the script's src, which a redirect leaves
        // as it was - uBO swaps what is served, not what the element says.
        const w = open({
            html: PAGE.replace('id="Cookiebot"',
                'id="Cookiebot" src="https://consent.cookiebot.com/uc.js' +
                '?framework=IAB&user_country=SE"'),
        }).window;
        assert.equal(w.Cookiebot.hasFramework, true);
        assert.equal(w.Cookiebot.userCountry, 'se');
    });

    it('does not leave a caller of getScript waiting', async ( ) => {
        const w = open().window;
        let called = false;
        w.Cookiebot.getScript('https://x.example/x.js', true, ( ) => {
            called = true;
        });
        await settle(30);
        // Nothing third-party is fetched, and nothing waits on it either.
        assert.equal(called, true);
    });

    it('executes the tags once, as their own guard does', async ( ) => {
        const fired = [];
        const w = open({
            before: w_ => {
                w_.addEventListener('CookiebotOnTagsExecuted', ( ) => {
                    fired.push('tags');
                });
            },
        }).window;
        await settle(30);
        assert.deepEqual(plain(fired), [ 'tags' ]);
        // A site may call this itself; theirs fires the event once either way.
        w.Cookiebot.runScripts();
        w.Cookiebot.runScripts();
        assert.deepEqual(plain(fired), [ 'tags' ]);
    });

    it('fires their events, in their order, with the declined half', async ( ) => {
        const seen = [];
        const w = open({
            before: w_ => {
                for ( const name of [
                    'CookiebotOnLoad', 'CookieConsentOnLoad',
                    'CookiebotOnAccept', 'CookiebotOnDecline',
                    'CookiebotOnTagsExecuted', 'CookiebotOnConsentReady',
                ] ) {
                    w_.addEventListener(name, ( ) => { seen.push(name); });
                }
                w_.CookiebotCallback_OnLoad = ( ) => { seen.push('cb:OnLoad'); };
                w_.CookiebotCallback_OnDecline = ( ) => {
                    seen.push('cb:OnDecline');
                };
                w_.CookiebotCallback_OnAccept = ( ) => { seen.push('cb:OnAccept'); };
            },
        }).window;
        await settle(30);
        assert.deepEqual(plain(seen), [
            'cb:OnLoad',
            'CookiebotOnLoad',
            'CookieConsentOnLoad',
            'cb:OnDecline',
            'CookiebotOnDecline',
            'CookiebotOnTagsExecuted',
            'CookiebotOnConsentReady',
        ]);
        // Nothing was accepted, so their accepted half never runs.
        assert.equal(seen.indexOf('CookiebotOnAccept'), -1);
        assert.equal(seen.indexOf('cb:OnAccept'), -1);
        assert.equal(w.CB_OnTagsExecuted_Processed, 1);
    });

    it('signals the consent modes theirs signals, all denied', async ( ) => {
        const w = open().window;
        await settle(30);
        const layer = Array.from(w.dataLayer).map(entry =>
            Array.isArray(entry) || typeof entry.length === 'number'
                ? Array.prototype.slice.call(entry)
                : entry
        );
        assert.deepEqual(plain(layer[0]), [ 'set', 'developer_id.dMWZhNz', true ]);
        assert.deepEqual(plain(layer[1]), [ 'consent', 'update', {
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied',
            analytics_storage: 'denied',
            functionality_storage: 'denied',
            personalization_storage: 'denied',
            // Theirs grants this one whatever the decision.
            security_storage: 'granted',
        } ]);
        assert.deepEqual(plain(layer[2]), [ 'set', 'ads_data_redaction', true ]);
        assert.deepEqual(plain(layer[3]), { event: 'cookie_consent_update' });
        assert.deepEqual(plain(Array.from(w.uetq)),
            [ 'consent', 'update', { ad_storage: 'denied' } ]);
    });

    it('reads the site configuration off their own script tag', ( ) => {
        const w = open().window;
        assert.equal(w.Cookiebot.serial, 'df50ecbc-61eb-4c83-9bde-3ac95023ce42');
        assert.equal(w.Cookiebot.hasFramework, false);
        // Injected as a scriptlet there is no currentScript, and the tag is
        // found the way their own code finds it.
        const noCurrent = open({
            html: PAGE.replace('id="Cookiebot"', 'id="Cookiebot" data-culture="en"'),
        }).window;
        assert.equal(noCurrent.Cookiebot.serial,
            'df50ecbc-61eb-4c83-9bde-3ac95023ce42');
    });

    it('finds their tag even when it lands before the tag is parsed', async ( ) => {
        // Injected as a scriptlet this runs at document_start, when the
        // parser has not reached their script tag: a lookup then finds
        // nothing, so everything read off it is read when it is asked for.
        const w = open({ html: '<html><head></head><body><p>x</p></body></html>' }).window;
        assert.equal(w.Cookiebot.serial, '');
        const tag = w.document.createElement('script');
        tag.id = 'Cookiebot';
        tag.setAttribute('data-cbid', 'late-arrival');
        tag.setAttribute('data-framework', 'IAB');
        tag.setAttribute('data-user-country', 'DK');
        w.document.head.appendChild(tag);
        assert.equal(w.Cookiebot.serial, 'late-arrival');
        assert.equal(w.Cookiebot.hasFramework, true);
        assert.equal(w.Cookiebot.userCountry, 'dk');
        // And the region it carries reaches the cookie, which is settled again
        // once the document has been parsed.
        await settle(30);
        assert.equal(theirParse(w).region, 'dk');
    });

    it('says so on the console where a site asked for the IAB framework',
        async ( ) => {
        let out;
        const w = open({
            html: PAGE.replace('data-blockingmode="auto"',
                'data-blockingmode="auto" data-framework="IAB"'),
            before: w_ => { out = lines(w_); },
        }).window;
        // That module is not in either of their files, so no __tcfapi is put
        // back and the site is named rather than left silent.
        assert.equal(w.Cookiebot.hasFramework, true);
        assert.equal(typeof w.__tcfapi, 'undefined');
        await settle(30);
        assert.ok(out[0].includes(' iab=IAB '), out[0]);
    });

    it('has no dialog to show, renew or withdraw from', ( ) => {
        const w = open().window;
        for ( const name of [
            'show', 'hide', 'renew', 'withdraw', 'submitCustomConsent',
            'deleteConsentCookie', 'resetCookies', 'updateRegulations',
        ] ) {
            assert.equal(typeof w.Cookiebot[name], 'function', name);
            w.Cookiebot[name]();
        }
        // And none of it changed the decision.
        assert.equal(w.Cookiebot.consent.marketing, false);
        assert.equal(theirParse(w).marketing, false);
    });

    it('says on the console what went in', async ( ) => {
        let out;
        const w = open({ before: w_ => { out = lines(w_); } }).window;
        await settle(30);
        assert.equal(out.length, 1);
        assert.equal(out[0],
            '[consent-rr] cookiebot-reject ' + versions.cookiebot +
            ' necessary=true denied=preferences,statistics,marketing' +
            ' iab=off cookie=written'
        );
        assert.equal(w.Cookiebot.consentRR.mode, 'reject');
        assert.equal(w.Cookiebot.consentRR.version, versions.cookiebot);
    });

    it('does nothing the second time it is injected', async ( ) => {
        const dom = open();
        const w = dom.window;
        await settle(30);
        const before_ = cookies(w).get('CookieConsent');
        const out = lines(w);
        w.eval(reject);
        await settle(30);
        assert.deepEqual(out, []);
        assert.equal(cookies(w).get('CookieConsent'), before_);
    });
});

/******************************************************************************/

describe('filters, cookiebot', ( ) => {
    const active = filtersText.split('\n')
        .filter(line => line.startsWith('!') === false)
        .join('\n');

    it('replaces the engine on both hosts, and leaves the dialog noop', ( ) => {
        const ours = active.split('\n')
            .filter(line => line.includes('cookiebot-reject'));
        assert.equal(ours.length, 2);
        assert.ok(active.includes('||consent.cookiebot.com/uc.js$script,redirect=cookiebot-reject.js'));
        assert.ok(active.includes('||consent.cookiebot.eu/uc.js$script,redirect=cookiebot-reject.js'));
        // cc.js is the dialog, and is never asked for once uc.js is replaced.
        assert.ok(active.includes('/cc.js$script,redirect=noopjs'));
    });
});
