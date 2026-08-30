# Chrome Web Store Listing - Tabot

> Last updated: 2026-08-30

## Store Listing

**Extension name**
Tabot

**Short description**
Private, local browser activity timeline. Thinking across tabs.

**Detailed description**
Tabot keeps a private timeline of your browser activity so you can see how your work moves across tabs.

See pages opened, tab changes, and interactions in one local dashboard. Pause tracking whenever you want, then resume when you are ready.

Install Tabot, browse normally, and open the Tabot dashboard to review your activity or export it for your own tools.

Your browsing activity stays on your device. Tabot does not send it to a Tabot server or share it with third parties.

For support, open an issue at https://github.com/Shanvit7/tabot/issues.

**Category**
Productivity

**Single purpose**
Keeps a private, local timeline of browser activity across tabs.

**Primary language**
English

## Graphics and Assets

| Asset | Dimensions | Status | Filename |
| --- | --- | --- | --- |
| Store icon | 128x128 PNG | Ready | `apps/extension/assets/icon.png` |
| Screenshot 1 | 1280x800 or 640x400 | Needed | Popup with tracking active |
| Screenshot 2 | 1280x800 or 640x400 | Needed | Dashboard with local activity summary |
| Small promo tile | 440x280 | Optional | |

### Screenshot Notes
- Show actual Tabot popup and dashboard only.
- Do not include browser developer tools, extension IDs, or unpacked-install instructions.

## Permissions Justification

| Permission | Type | Justification |
| --- | --- | --- |
| `tabs` | permission | Records tab creation, activation, updates, removal, and page URL/title metadata for the user's local activity timeline. |
| `webNavigation` | permission | Records top-level page navigation so the local timeline can show visits across tabs. |
| `<all_urls>` | host permission | Lets Tabot record click, scroll, keyboard-activity, and page-visibility signals on pages the user visits. It does not record typed keys or page contents. |

## Privacy and Data Use

### Data Collection

**Does the extension collect user data?** Yes, locally on the user's device only.

| Data type | Collected? | Transmitted off-device? | Purpose | Shared with third parties? |
| --- | --- | --- | --- | --- |
| Web history | Yes | No | Build local activity timeline from page URLs and navigation. | No |
| User activity | Yes | No | Record tab changes, clicks, scrolling, keyboard activity occurrence, and page visibility. | No |
| Website content | No | No | Tabot does not capture page text, form contents, or typed keys. | No |
| Personally identifiable information | No | No | Not collected by Tabot. | No |

### Data Use Certification
- [x] Data is not sold to third parties.
- [x] Data is not used for purposes unrelated to Tabot's core functionality.
- [x] Data is not used for creditworthiness or lending purposes.

## Privacy Policy

**Privacy Policy URL**
Required before submission. Publish a live policy matching this disclosure, then place its URL here.

## Distribution

**Visibility:** Public
**Regions:** All regions

## Developer Info

**Publisher name**
Required before submission.

**Contact email**
Required before submission.

**Support URL**
https://github.com/Shanvit7/tabot/issues

**Homepage URL**
https://shanvit7.github.io/tabot/

## Version History

| Version | Date | Changes | Status |
| --- | --- | --- | --- |
| 0.1.0 | 2026-08-30 | Initial Chrome Web Store submission. Local activity timeline, dashboard connection, and pause/resume control. | Draft |

## Review Notes

### Known limitations
- Tabot cannot run on Chrome internal pages, Chrome Web Store pages, or other restricted browser pages.
- Pausing stops new collection; existing local activity remains until the user clears extension data or removes the extension.
- Dashboard is served from `https://shanvit7.github.io/tabot/` and connects directly to the installed Web Store extension. No browser data passes through GitHub Pages or a Tabot server.
