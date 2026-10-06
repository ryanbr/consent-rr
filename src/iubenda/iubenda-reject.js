/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    Stands in for iubenda's Cookie Solution, whose page-side file is the 4KB
    loader at cdn.iubenda.com/cs/iubenda_cs.js - the 450KB core it fetches
    never arrives either.

    No banner, and their own refusal in their own record: necessary true, and
    functionality, experience, measurement and marketing false, under the
    cookie their configuration names - _iub_cs- plus their storage id - or in
    localStorage where their storage.type says so. Their simple form,
    consent: false, where the tenant does not use per-purpose consent.

    Their callbacks fire in the order their own code fires them for a stored
    decision, their api answers the refusal, their PubSub is installed, and
    Google consent mode is told denied through their own mapping. The IAB
    layer goes in refusing where their tenant switched it on, with
    euconsent-v2 written so a stored acceptance cannot outlive this.

    Nothing is requested and nothing is sent: no core, no per-site
    configuration, no consent log.

    The tags their auto-blocker parked stay parked. Use
    iubenda-reject-unblock.js on a site that withholds content until consent,
    or iubenda-accept.js where a refusal is not an option.

*/

(function() {
    'use strict';
    // @include lib/iubenda-core.js
    // @include lib/iubenda-tcf.js
    consentRRIubenda('reject', consentRRIubendaTcf);
})();
