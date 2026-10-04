/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    Stands in for Ziff Davis's zdconsent.js and zdconsent_eu.js: no banner,
    their own Deny All record in their own cookies, and the work a page
    queued behind consent left queued - except the ungated run queue, which
    their script runs whatever was decided and which blocking the file
    outright leaves unrun.

    Their script is a OneTrust front end, and the function that decides what
    is consented reads OneTrust's groups over its own defaults, so the
    OneTrust layer goes in underneath: one refusal, told the same way to a
    page reading OptanonActiveGroups and to one reading zdconsent.optins.
    Each layer says its own console line, named for this file.

*/

(function() {
    'use strict';
    // @include ../onetrust/lib/onetrust-core.js
    // @include ../onetrust/lib/onetrust-tcf.js
    // @include ../onetrust/lib/onetrust-gpp.js
    // @include lib/zdconsent-core.js
    consentRRZdConsent('reject', mode => {
        consentRROneTrust(
            mode, consentRRTcf, consentRRGpp, 'zdconsent-reject/onetrust');
    });
})();
