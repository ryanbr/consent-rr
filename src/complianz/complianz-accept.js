/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    Stands in for Complianz's cookiebanner script. The page sees a visitor
    who has allowed every category: no banner, and the tags their blocker
    parked are released the way their own cmplz_enable_category releases
    them.

*/

(function() {
    'use strict';
    // @include lib/complianz-core.js
    consentRRComplianz('accept');
})();
