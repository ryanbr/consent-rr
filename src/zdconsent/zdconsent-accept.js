/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    Stands in for Ziff Davis's zdconsent.js and zdconsent_eu.js, granting.

    For the EU build, where nothing is consented until a visitor answers and
    the analytics, functional, social and cmd queues therefore stay unrun -
    and for an accept-or-pay site, where their script rewrites OneTrust's
    reject button into a subscribe link and there is no refusal on offer.

    Outside GDPR this is close to a no-op: that build consents by default.
    The one thing it will not do there is overrule a Global Privacy Control
    header, which their own script honours and this does too - the refusal
    stands, both layers stand down together, and the console line says so.

*/

(function() {
    'use strict';
    // @include ../onetrust/lib/onetrust-core.js
    // @include ../onetrust/lib/onetrust-tcf.js
    // @include ../onetrust/lib/onetrust-gpp.js
    // @include lib/zdconsent-core.js
    consentRRZdConsent('accept', mode => {
        consentRROneTrust(
            mode, consentRRTcf, consentRRGpp, 'zdconsent-accept/onetrust');
    });
})();
