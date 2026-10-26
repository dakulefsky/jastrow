# Design and usability review — 1.10.1

Dictionary startup now uses an external script compatible with its CSP. Added a keyboard skip link, narrower reading column, wrapping source references and search controls for side panes. Fixed self-contained preview packaging to include the new startup script.

## Verification

Search, phrases, unified definitions, unified browser UI and reading suites passed.

All four interfaces checked in Chromium at 320, 390, 600 and 1280 pixels, without page overflow, JavaScript errors or CSP violations. Audio UI checks use a mock Otzaria bridge and a sample library. Installed Otzaria/WebView rendering and physical audio output have not been tested. These are review builds, not store publications.
