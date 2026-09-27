/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/ryanbr/consent-rr

    Stands in for OneTrust's otSDKStub.js. The page sees a visitor who has
    already turned everything but C0001 down: no banner and no re-prompt - but
    every tag parked behind a category is let go anyway.

    For sites that put the content itself behind a category and would otherwise
    show a placeholder. Nothing is consented to: the cookies, the globals, TCF
    and GPP all carry the same refusal onetrust-reject.js does. Un-parking a tag
    is mechanical, and uBlock Origin still blocks whatever it asks for.

    It cannot help where the page's own script reads OnetrustActiveGroups and
    renders the placeholder itself - that decision is the site's, not the SDK's.

    IAB TCF vendors are answered separately. See lib/onetrust-tcf.js.

*/

(function() {
    'use strict';
    // @include lib/onetrust-core.js
    // @include lib/onetrust-tcf.js
    // @include lib/onetrust-gpp.js
    consentRROneTrust('reject-unblock', consentRRTcf, consentRRGpp);
})();
