# Chrome Web Store listing — English

## Name

Forensic Web Capture

## Short description

Capture web pages with screenshots, reports and SHA-256 hashes. Local processing and optional timestamps.

## Full description

Forensic Web Capture creates documented captures of web pages selected by the user,
with evidence files and reports saved on their computer.

- Full-page screenshots as PDF, PNG or JPEG, with a configurable height limit.
- Cover page and an optional printable A4 PDF, including landscape orientation.
- Optional MHTML snapshot and HTML source saved as inert text.
- Optional collection of HTTP responses, redirects, server addresses, TLS certificate
  details and HAR network records, with collection limits and missing content documented.
- Text and JSON reports, SHA-256 file hashes, a checksum manifest and a ZIP package.
- Operator, organisation and case reference fields, plus an operation log.
- Optional RFC 3161 timestamp from a user-selected service, with signature and certificate
  chain verification. The timestamp service may require a separate subscription.

Captures are processed locally and are not sent to the developer. If timestamping is
selected, the TSA receives the manifest hash and a nonce, along with configured service
credentials. The provider also receives normal connection metadata. Browsing the selected
page continues to involve the browser's normal connections to that website.

Capture and debugger attachment begin only after a user request. Network collection
reloads the page and may change dynamic content. Internal browser pages and certain URL
schemes are not supported.

Hashes help detect later file changes. The tool does not certify the truth of website
content, computer integrity or admissibility as evidence. TSA verification does not include
OCSP/CRL revocation checks or eIDAS qualification through trusted lists.

The program is free to use. Options displays a Satispay username for optional developer
support, with a suggested €1 or any amount. Contributions do not unlock features and are
not processed or tracked by the extension. There are no referral codes or links.

## Suggested category

Developer Tools. Confirm the closest category available in the dashboard.

## Links

- Project website: https://github.com/k4pPa3/plugin-screenshot-chrome
- Support: https://github.com/k4pPa3/plugin-screenshot-chrome/issues
- Privacy: https://github.com/k4pPa3/plugin-screenshot-chrome/blob/main/PRIVACY.md
