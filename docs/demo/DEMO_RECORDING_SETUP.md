# Recording setup (Windows)

## Recorder: OpenScreen, already installed

OpenScreen 2.2.1 from the Microsoft Store is on this laptop. It records one window, adds a clean cursor and zooms on clicks, and exports MP4, all free. **OBS Studio** is the fallback; the settings are below.

### OpenScreen, by hand

1. Open OpenScreen from the Start menu.
2. Source: choose **window A** (the private browser window with PathAble), not the whole screen. Nothing else on your desktop gets recorded.
3. Turn the **microphone** on. Leave the camera off.
4. Record, follow [DEMO_SHOTLIST.md](DEMO_SHOTLIST.md), then stop. The take opens in the editor.
5. Edit: trim the start and end, speed up any AI wait (add a "sped up" text), and set **16:9**.
6. **Captions:** run the transcription (on-device Whisper, free). Fix "PathAble", "Muse" and "Dhanbad" if they're misheard. Captions matter for an accessibility project.
7. Export: **MP4, 1080p, 30 fps or more.**

### OpenScreen, driven by Claude

Claude can record and edit through OpenScreen's MCP tools once you register them, with a one-time command given in the session report.

### OBS Studio (fallback)

- Settings → Video: Base and Output **1920×1080**, **30 fps**.
- Output → Recording: format **MP4** (or MKV, then File → Remux to MP4). Encoder: a hardware one (NVENC, QSV or AMF) if listed, otherwise x264, quality "High".
- Audio: 48 kHz. Add the microphone filters **Noise Suppression (RNNoise)** and **Compressor**.
- Source: **Window Capture** of the private browser window.

## Screen and browser

- Display scaling 100–125%. A browser window of 1600×1000 inside a 1920×1080 screen.
- Browser zoom **110%**, so text stays readable after compression.
- A private window: no extensions, bookmarks bar, saved needs or sign-in.
- Hide the address bar if your recorder can't crop it. In Chrome, open the site as an app window: `chrome --app=https://pathable-ai.vercel.app --window-size=1600,1000 --incognito`.
- Cursor: normal size. OpenScreen draws its own.

## A quiet laptop

- **Do Not Disturb** on (Win+N, then the bell icon). Close WhatsApp, mail and chat apps.
- Charger in, power mode **Best performance**.
- Close Brave and other heavy apps. This laptop has only about 0.5 GB of memory free when busy, and a slow page looks worse than a closed app.

## Microphone

- A wired earphone mic or a USB mic beats the laptop mic. Keep it a hand's width from your mouth, slightly to the side.
- Use a small room with soft furnishings (bed, curtains). Turn off the fan.
- Record 10 seconds and listen back on headphones before the real take.
- No background music.

## Export

- MP4 (H.264 video, AAC audio), 1920×1080, 30 fps, **under 3:00**, with captions burned in or uploaded as an SRT.
- Upload to YouTube as **Unlisted**, unless the rules say otherwise, and check the link in a private window.
