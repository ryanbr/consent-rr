/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    Stands in for Didomi's per-tenant loader: no banner, their own
    reject-all record in their token, and nothing consented.

*/

(function() {
    'use strict';
    // @include lib/didomi-core.js
    consentRRDidomi('reject');
})();
