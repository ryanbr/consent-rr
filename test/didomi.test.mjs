/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Didomi. Everything asserted here is their own shape, read off their SDK:
    the record their token-building function returns, the three events their
    sendEvents() emits in order, and the twenty field names their state
    object carries.

*/

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import {
    cookies, filtersText, loadResources, runDom, settle, versions,
} from './helpers.mjs';

const URL = 'https://www.20minutos.es/noticia/';
const LOADER = 'https://sdk.privacy-center.org/' +
    '6e7011c3-735d-4a5c-b4d8-c8b97a71fd01/loader.js?target=www.20minutos.es';
const PAGE = '<!doctype html><html lang="es"><head>' +
    '<script src="' + LOADER + '"></script>' +
    '</head><body><p id="content">x</p></body></html>';

let reject;
let accept;

before(async ( ) => {
    const resources = await loadResources();
    reject = resources.get('didomi-reject.js');
    accept = resources.get('didomi-accept.js');
});

// runDom returns the jsdom instance, not its window.
const boot = (which, options = {}) => runDom(
    which, options.url || URL, options.html || PAGE,
    w => {
        if ( typeof options.before === 'function' ) { options.before(w); }
    }
).window;

const lines = w => {
    const out = [];
    w.console.info = line => { out.push(String(line)); };
    return out;
};

const token = w => {
    const raw = cookies(w).get('didomi_token');
    assert.ok(raw !== undefined, 'no didomi_token cookie');
    return JSON.parse(w.atob(raw));
};

/******************************************************************************/

describe('didomi-reject', ( ) => {
    it('writes their record, in their own shape', ( ) => {
        const w = boot(reject);
        const record = token(w);
        assert.deepEqual(
            Object.keys(record).sort(),
            [
                'created', 'purposes', 'purposes_li', 'updated',
                'user_id', 'vendors', 'vendors_li', 'version',
            ]
        );
        for ( const key of [ 'vendors', 'purposes', 'vendors_li', 'purposes_li' ] ) {
            assert.deepEqual(
                Object.keys(record[key]).sort(), [ 'disabled', 'enabled' ], key
            );
        }
        assert.equal(record.version, null, 'null until didomi-tcf.js exists');
    });

    it('consents to nothing, which is what their refusal is', ( ) => {
        const w = boot(reject);
        const record = token(w);
        assert.deepEqual(record.purposes.enabled, []);
        assert.deepEqual(record.purposes_li.enabled, []);
        assert.ok(record.purposes.disabled.length > 8, 'and lists what it refused');
        assert.ok(record.purposes.disabled.includes('select_personalized_ads'));
        assert.equal(w.Didomi.getUserConsentStatusForPurpose('cookies'), false);
        assert.equal(w.Didomi.getUserConsentStatusForVendor('google'), false);
    });

    it('writes it to localStorage as well, as their storage service does', ( ) => {
        const w = boot(reject);
        const stored = w.localStorage.getItem('didomi_token');
        assert.ok(stored !== null);
        assert.deepEqual(
            JSON.parse(w.atob(stored)).purposes.enabled, []
        );
    });

    it('publishes the state a site gates its own content on', ( ) => {
        const w = boot(reject);
        const state = w.didomiState;
        assert.equal(state.didomiGDPRApplies, 1);
        assert.equal(state.didomiRegulationName, 'gdpr');
        assert.equal(state.didomiPurposesConsent, '', 'nothing consented');
        assert.ok(
            state.didomiPurposesConsentDenied.includes('measure_ad_performance')
        );
        assert.equal(state.didomiIABConsent, '', 'no TC string invented');
    });

    it('pushes that state into the data layer, as theirs does', ( ) => {
        const w = boot(reject);
        assert.ok(Array.isArray(w.dataLayer));
        assert.ok(
            w.dataLayer.some(item => item && item.didomiGDPRApplies === 1),
            JSON.stringify(w.dataLayer).slice(0, 200)
        );
    });

    it('emits their three events, in their order', ( ) => {
        const seen = [];
        const w = boot(reject, {
            before: w_ => {
                w_.didomiEventListeners = [
                    { event: 'consent.changed', listener: ( ) => seen.push('public') },
                    { event: 'internal.consent.changed', listener: ( ) => seen.push('changed') },
                    { event: 'internal.consent.updated', listener: ( ) => seen.push('updated') },
                ];
            },
        });
        assert.deepEqual(seen, [ 'updated', 'changed', 'public' ]);
        assert.equal(typeof w.Didomi, 'object');
    });

    it('hands their listener the payload their sendEvents does', ( ) => {
        let got = null;
        boot(reject, {
            before: w_ => {
                w_.didomiEventListeners = [
                    { event: 'consent.changed', listener: p => { got = p; } },
                ];
            },
        });
        assert.equal(got.fromEUConsent, false);
        assert.equal(got.action, 'disagreeToAll');
        // Their live object, from the page's realm, so deepEqual against a
        // node-side [] compares prototypes and fails.
        assert.equal(got.consentToken.purposes.enabled.length, 0);
        assert.ok(got.consentToken.purposes.disabled.length > 8);
    });

    it('drains didomiOnReady, and keeps it working afterwards', ( ) => {
        const seen = [];
        const w = boot(reject, {
            before: w_ => {
                w_.didomiOnReady = [ api => seen.push(typeof api.getUserStatus) ];
            },
        });
        assert.deepEqual(seen, [ 'function' ], 'the queued one ran');
        w.didomiOnReady.push(api => seen.push(api === w.Didomi));
        assert.deepEqual(seen, [ 'function', true ], 'and a late one runs too');
    });

    it('answers a listener registered after it settled', ( ) => {
        const w = boot(reject);
        let hits = 0;
        w.Didomi.on('consent.changed', ( ) => { hits += 1; });
        assert.equal(hits, 1, 'a late listener is answered, not parked');
        w.didomiEventListeners.push({
            event: 'ready', listener: api => { hits += (api === w.Didomi ? 1 : 0); },
        });
        assert.equal(hits, 2);
    });

    it('says no when asked whether to collect consent', ( ) => {
        const w = boot(reject);
        const d = w.Didomi;
        assert.equal(d.isConsentRequired(), false);
        assert.equal(d.shouldConsentBeCollected(), false);
        assert.equal(d.willNoticeBeShown(), false);
        assert.equal(d.isUserConsentStatusPartial(), false);
        assert.equal(d.notice.isVisible(), false);
        assert.doesNotThrow(( ) => d.notice.hide());
        assert.doesNotThrow(( ) => d.preferences.show());
    });

    it('reports no TCF, rather than inventing a string', ( ) => {
        const w = boot(reject);
        const status = w.Didomi.getUserStatus();
        assert.equal(status.consent_string, '');
        assert.equal(status.addtl_consent, '');
        assert.equal(w.Didomi.getTCFVersion(), null);
        assert.equal(w.__tcfapi, undefined, 'no TCF API is stood up');
    });

    it('fires their own DOM event for a page that waits on it', async ( ) => {
        let heard = false;
        boot(reject, {
            before: w_ => {
                w_.addEventListener('didomi-ready', ( ) => { heard = true; });
            },
        });
        await settle();
        assert.equal(heard, true);
    });

    it('stands aside where their SDK already answered', ( ) => {
        const w = boot(reject, {
            before: w_ => {
                w_.Didomi = { theirs: true };
            },
        });
        const out = lines(w);
        assert.equal(w.Didomi.theirs, true);
        assert.equal(cookies(w).get('didomi_token'), undefined,
            'and writes no record over theirs');
        assert.ok(out.length === 0 || out.join(' ').includes('kept=theirs'));
    });

    it('says what it did', ( ) => {
        let out;
        boot(reject, { before: w_ => { out = lines(w_); } });
        assert.equal(out.length, 1);
        assert.ok(out[0].includes('didomi-reject ' + versions.didomi), out[0]);
        assert.ok(out[0].includes('purposes=none'), out[0]);
        assert.ok(out[0].includes('token=written'), out[0]);
        assert.ok(out[0].includes('tcf=absent'), out[0]);
    });
});

/******************************************************************************/

describe('didomi-accept', ( ) => {
    it('consents to every purpose they define', ( ) => {
        const w = boot(accept);
        const record = token(w);
        assert.deepEqual(record.purposes.disabled, []);
        assert.ok(record.purposes.enabled.includes('cookies'));
        assert.ok(record.purposes.enabled.includes('select_personalized_ads'));
        assert.equal(w.Didomi.getUserConsentStatusForPurpose('cookies'), true);
        assert.equal(w.Didomi.getUserConsentStatusForVendor('google'), true);
    });

    it('reports them where a site reads its own gate', ( ) => {
        const w = boot(accept);
        assert.ok(w.didomiState.didomiPurposesConsent.includes('cookies'));
        assert.equal(w.didomiState.didomiPurposesConsentDenied, '');
    });

    it('takes a purpose the tenant named itself', ( ) => {
        // Their ids are a fixed vocabulary, but a tenant may add its own and
        // declare them in didomiConfig - which is the only place this can
        // learn them.
        const w = boot(accept, {
            before: w_ => {
                w_.didomiConfig = {
                    app: { customPurposes: [ { id: 'house-ads' }, { id: 'abtest' } ] },
                };
            },
        });
        const enabled = token(w).purposes.enabled;
        assert.ok(enabled.includes('house-ads'), enabled.join(','));
        assert.ok(enabled.includes('abtest'));
        assert.equal(w.Didomi.getUserConsentStatusForPurpose('house-ads'), true);
    });

    it('still invents no TC string', ( ) => {
        const w = boot(accept);
        assert.equal(w.didomiState.didomiIABConsent, '');
        assert.equal(w.Didomi.getUserStatus().consent_string, '');
        assert.equal(w.__tcfapi, undefined);
    });

    it('answers a page that drives the decision itself', ( ) => {
        const w = boot(accept);
        assert.equal(w.Didomi.setUserAgreeToAll(), true);
        assert.equal(w.Didomi.setUserDisagreeToAll(), false,
            'an accept resource does not re-record as refused');
        assert.deepEqual(token(w).purposes.disabled, []);
    });

    it('says what it did', ( ) => {
        let out;
        boot(accept, { before: w_ => { out = lines(w_); } });
        assert.ok(out[0].includes('didomi-accept'), out[0]);
        assert.ok(out[0].includes('purposes=all'), out[0]);
    });
});

/******************************************************************************/

describe('filters, didomi', ( ) => {
    it('redirects their loader to the reject resource', ( ) => {
        assert.match(
            filtersText,
            /\|\|sdk\.privacy-center\.org\/\*\/loader\.js\$script,redirect=didomi-reject\.js/
        );
    });

    it('noops the two bundles only the loader asks for', ( ) => {
        assert.match(filtersText, /modern\/sdk\.\*\.js\$script,redirect=noopjs/);
        assert.match(filtersText, /modern\/ui-web-\*\.js\$script,redirect=noopjs/);
    });

    it('says in the list that TCF is not answered yet', ( ) => {
        // A reader has to be able to tell a deliberate gap from an oversight.
        assert.match(filtersText, /WHAT THIS DOES NOT ANSWER YET: IAB TCF/);
    });
});
