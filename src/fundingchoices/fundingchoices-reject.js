/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    Stands in for Google Funding Choices, from
    fundingchoicesmessages.google.com.

    Blocking the request is already safe, so this is not here to stop
    anything: it ends the waits blocking leaves behind, by mirroring the
    inactive path Google's own script takes when Funding Choices has decided
    it has nothing to show - the googlefcInactive and googlefcLoaded iframes
    consumers watch for, their internal queue answering instead of
    collecting, and their postMessage API replying.

    The refusal is their FCCDCF cookie's absence, which is how Google's own
    gpt.js and adsbygoogle.js read it: no cookie, no TC string. Writing one
    would mint a consent string, so nothing is written - and a cookie a
    visitor consented to before installing this is cleared, because theirs
    outlives a page by about thirteen months.

    No accept resource. There is nothing a page needs consent for here that
    blocking the request would not already have taken away.

*/

(function() {
    'use strict';
    // @include lib/fundingchoices-core.js
    consentRRFundingChoices();
})();
