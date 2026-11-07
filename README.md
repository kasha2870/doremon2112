# DIGITAL CLOCK — Smart Time Display

A responsive, client-side digital clock experience built with HTML, CSS, and vanilla JavaScript. No build step or backend is required.

## Run locally

Open `index.html` in a modern browser, or serve this directory with any static file server:

```bash
python3 -m http.server 8000
```

Then visit <http://localhost:8000>.

## Features

- Local real-time clock with date, 12/24-hour formats, optional seconds, and six display styles.
- Stopwatch with pause, resume, lap recording, and reset.
- Countdown timer and persistent, configurable local alarms.
- World clocks for New York, London, Tokyo, and Sydney.
- Fullscreen, light/dark mode, digit/background colors, size, brightness, and typeface controls.
- Preferences and alarms persist in browser `localStorage`.
- Optional alarm/timer sound via the Web Audio API. Enable sound with a user interaction; browser autoplay restrictions apply.
- Responsive layout and reduced-motion support.

The clock uses the visitor's local system time and timezone. Alarm checks run while the page is open; this browser-only app cannot alert while the page/browser is closed.
