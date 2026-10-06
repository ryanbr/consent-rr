/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    iubenda, for a site that withholds something until consent.

    Stores and sends the same refusal as iubenda-reject.js - the record is a
    refusal, Google consent mode is told denied, and the IAB string grants
    nothing - and separately tells the page's own scripts that every purpose
    is on, because that is a variable on the page rather than anything
    transmitted. The tags their auto-blocker parked are freed, by their own
    markers:

        _iub_cs_activate, _iub_cs_activate-inline, _iub_cs_activate_iframe
        data-iub-purposes, data-suppressedsrc | suppressedsrc

    and the pass runs again as the document arrives, because this stands in
    for a script in <head> and the parked tags are below it.

    Freeing a tag claims no consent, and uBlock Origin still blocks whatever
    it then asks for. Where the site needs the consent itself rather than the
    tags, use iubenda-accept.js.

*/

(function() {
    'use strict';
    // @include lib/iubenda-core.js
    // @include lib/iubenda-tcf.js
    consentRRIubenda('reject-unblock', consentRRIubendaTcf);
})();
