/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    Stands in for Didomi's per-tenant loader. The page sees a visitor who has
    already agreed to every purpose: no banner, no re-prompt, and content the
    site gates on its own purpose read is shown. IAB TCF vendors are NOT
    answered - there is no __tcfapi here yet.

*/

(function() {
    'use strict';
    // @include lib/didomi-core.js
    consentRRDidomi('accept');
})();
