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
    already turned everything but C0001 down: no banner, no re-prompt, and
    tags parked behind a category stay parked. IAB TCF vendors are answered
    too, with a TC string that grants nothing.

*/

(function() {
    'use strict';
    // @include lib/onetrust-core.js
    // @include lib/onetrust-tcf.js
    consentRROneTrust('reject', consentRRTcfDenied);
})();
