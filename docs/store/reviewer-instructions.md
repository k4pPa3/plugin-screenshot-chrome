# Reviewer test instructions

No account, payment, TSA subscription or Satispay interaction is needed to test the core
capture workflow. Do not use personal, production or investigative data for this review.

1. Load the packaged extension. Open a public test page, such as https://example.com/.
2. Open the extension action. Select PNG or PDF and enable the ZIP and JSON report options.
   Timestamping and network collection are optional; keep timestamping disabled for the
   initial test. Leave operator/case enforcement disabled unless testing those fields.
3. Start capture. The tab displays Chrome's debugger notification during acquisition.
   Wait for completion, then check the downloaded ZIP, screenshot, text/JSON report,
   checksum manifest and SHA256SUMS. No capture files are uploaded by the extension.
4. On the same harmless page, repeat with network data, HAR, HTML source and MHTML enabled.
   The page reloads. HAR includes only the observed interval and available response bodies;
   missing data and truncation are recorded. HTML is inert source text; MHTML is active
   page content and should be opened only in an appropriate isolated test environment.
5. In Options, optionally enable the other-extension inventory. A separate `management`
   permission is requested; denying it should not stop ordinary screenshot acquisition.
6. Inspect the support panel at the bottom of Options. It has a public Satispay username
   and a clipboard button, but no referral code, outbound promo link or payment flow.
   No contribution is needed and it does not unlock any features.
7. Optional TSA test: choose the default FreeTSA HTTPS endpoint, save and grant access for
   that provider, then use Test service. If it is unavailable, the UI reports the failure;
   a timestamp is not required for ordinary capture. No reviewer credentials are supplied
   or necessary. Custom/paid providers use credentials entered by the user.
8. For a saved acquisition, open Verify timestamp from the popup or Options. Choose
   one evidence file, its manifest and RFC 3161 response. Verification stays local.
9. Only installations loaded from a folder offer the folder updater. A user-selected
   directory is required; the verified package is backed up and copied there. The
   extension never evaluates downloaded scripts. Store-managed installations use
   the browser update mechanism and do not offer this updater.

Limitations: internal browser pages are rejected by the current capture mode. Full-page
viewport expansion can alter viewport-relative layouts. TSA verification checks signature
and certificate chain but not revocation or qualified eIDAS service status. A valid hash or
timestamp does not establish the truth of the source content or host-system integrity.
