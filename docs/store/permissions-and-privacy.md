# Dichiarazioni per il pannello Chrome Web Store

Materiale da verificare e copiare nei campi correnti del pannello. Non è una dichiarazione
che Google abbia approvato il prodotto. I nomi e il significato dei campi possono cambiare.

## Single purpose — English

Create user-initiated, documented captures of selected web pages, with locally saved
screenshots, supporting page/network data, reports and integrity hashes, plus optional
RFC 3161 timestamping of the acquisition manifest.

## Permessi — testi per il revisore

| Manifest entry | Justification |
|---|---|
| `debugger` | Attaches to the user-selected tab during a requested acquisition to run Chrome DevTools Protocol screenshot, layout, snapshot and network commands. It captures full-page images, MHTML, HTTP/TLS details and optional HAR data, then detaches in cleanup. It does not attach automatically while the user browses. |
| `activeTab` | Reads the current tab URL/title and identifies the page the user explicitly requests to capture. |
| `downloads` | Saves the user-requested acquisition files or ZIP to the user's computer and checks completion, interruptions, deletion and unexpected renaming. |
| `storage` | Stores user preferences, optional operator/case fields and TSA settings locally. Capture status and session credentials use session storage; optional encrypted credentials use local storage. No sync storage or developer account service is used. |
| `management` (optional) | Only when the user enables the environment inventory, reads enabled extensions' names, versions and permissions to document software that could alter captured content. This is included in the local report. It is not sent to the developer. |
| `https://*/*` (optional host permission) | Lets the user select an HTTPS RFC 3161 timestamp service, including custom/private providers. The extension requests runtime access for the configured service origin, rather than requesting access to all HTTPS sites at installation. The request sends the acquisition-manifest hash, a nonce and configured service credentials, not the capture files or page URL. For installations loaded from a folder, the optional update check requests access to api.github.com and reads public release metadata only on user request. Chrome Web Store installations use Chrome's update mechanism. |
| `http://*/*` (optional host permission) | Supports user-selected legacy or private HTTP timestamp endpoints that do not use credentials. Runtime access is requested for the configured origin. Credential transmission over HTTP is rejected. The default TSA uses HTTPS; users should prefer HTTPS endpoints. |

## Remote code

Select **No**: JavaScript, CSS, locale strings, cryptographic verification code and bundled
trust anchors are packaged with the extension. TSA replies and captured site resources are
data, not remotely downloaded extension code. The extension does not evaluate downloaded
scripts as its own code. Website scripts may execute normally inside the visited website.

## Data handling: do not equate local processing with no data handling

Google explicitly requires disclosure even for data processed or stored only locally.
The extension captures website content and may retain sensitive data already visible in
the selected page or present in its HTML, MHTML or response bodies.

| Dashboard category, if present | Actual use to disclose |
|---|---|
| Website content | Screenshots, DOM/source, visible text and links, MHTML and optional response bodies are read for the user-requested acquisition and saved locally. |
| Web history | The selected URL and redirect history are recorded; up to ten previous entries of that tab are included only if the user enables tab history. This is not continuous browsing-history collection. |
| Personally identifiable information | Operator, organisation, case reference and notes may identify people. Page captures can also contain personal information. |
| Authentication information | Configured TSA credentials are processed locally and sent only to the selected TSA when required, over HTTPS. Captures of authenticated pages can retain tokens or session-related content. Certain HAR headers are redacted, but this is not general content sanitisation. With the optional cookies and storage feature, cookie and storage names and attributes are saved locally with SHA-256 digests of the values; values in clear text only if the user enables a separate setting. |
| Health, financial/payment or personal communications data | The extension does not target accounts or services of these types, but captured pages may contain them. Review the live questionnaire's definitions and declare applicable categories; do not promise that such data can never appear in captures. No payments are processed by this extension. |
| Installed software / device information, if asked | Optional enabled-extension inventory, browser information and the extension-code fingerprint are included only in the local acquisition report. |
| Usage tracking, advertising profiles or background interaction telemetry | No analytics, ad profiling, keystroke logging or click telemetry is implemented. This does not negate handling of page/network data during a requested capture. |
| Web history / website content sent to third parties, if asked | Only with the optional, off-by-default external network context: the page's host name is sent to IANA, the domain registry's RDAP service and the chosen DNS-over-HTTPS provider (Cloudflare or Google); the server IP to the regional internet registry's RDAP service. No path, query, page content, evidence or custody data is sent. |

The developer does not receive the captures or settings. The user-selected TSA receives
hash, nonce and any configured credentials, and can observe the request IP and transport
metadata. No referral/advertising destination is contacted. The Satispay support panel
only copies a public username into the clipboard after a user click.

For development installations loaded from a folder, the optional updater can write
the verified release package and a backup to a directory explicitly selected through
the browser file picker. It does not retain directory handles between sessions or send
local paths to GitHub. Store-managed installations do not offer this update path.

Confirm the dashboard's Limited Use certifications only after checking that their wording
matches this implementation. The code does not sell data or transfer it for advertising,
creditworthiness or lending, and does not give the developer access to the captures.

Privacy-policy URL:
https://github.com/k4pPa3/plugin-screenshot-chrome/blob/main/PRIVACY.md

The author should keep a public, stable version of that policy aligned with each release.

## Fonti ufficiali verificate il 5 novembre 2026

- https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- https://developer.chrome.com/docs/webstore/program-policies/affiliate-ads
- https://developer.chrome.com/docs/webstore/program-policies/unexpected-behavior
