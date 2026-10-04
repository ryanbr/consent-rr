/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    Stands in for Complianz's cookiebanner script: no banner, their own
    record with only the functional category allowed, and the tags their
    blocker parked left parked.

*/

(function() {
    'use strict';
    // @include lib/complianz-core.js
    consentRRComplianz('reject');
})();
