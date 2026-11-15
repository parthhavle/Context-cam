# ContextCam

**A voice-first, high-contrast visual assistant for blind and low-vision people, powered by the Google Gemini API.**

Standard screen readers can read text on a screen, but they cannot interpret the real world around you. ContextCam fills that gap: point your phone camera at a scene, ask a question by voice or text, and hear a short spoken answer.

> "Which of these three bottles is the 50 mg dose?"
> "Read this menu and translate it to English."
> "Which of these cables is the HDMI one, and where is it?"
> "Does the crosswalk signal look safe?"

## Features

- **Multimodal input**: sends the live camera frame together with a text question or recorded audio to Gemini.
- **Voice-first interface**: one giant "Tap to ask" button, a "Describe scene" button, and a typed-question fallback. Spacebar toggles the microphone on desktop.
- **Spoken answers**: replies are read aloud with the browser's speech synthesis, with a Repeat button, a Stop button (or Escape), and adjustable speech speed.
- **Spatial reasoning**: answers use directions a person can act on ("on the left", "at 2 o'clock", "top shelf").
- **Translation and text reading**: reads text in any language, then gives it in your chosen answer language (English, Hindi, Marathi, Spanish, French, German).
- **Safety-aware**: for medicine, traffic, expiry dates and similar topics it states what it sees, how confident it is, and suggests double-checking. It never says it is definitely safe to cross a road.
- **Helpful when the picture is bad**: if the frame is blurry, dark or cropped, it tells you how to fix it ("move the phone further back").
- **Follow-up questions**: the last few turns are remembered, so you can ask "and the one next to it?".
- **Accessible by design**: black and yellow high-contrast theme, large touch targets (48 px and up), visible focus outlines, ARIA live regions for screen readers, skip link, audio beeps and vibration feedback, reduced-motion support.
- **Works on mobile and desktop**: uses the rear camera by default, with a Flip camera button.

## How it works

```
Phone browser                         Vercel                       Google
-------------                         ------                       ------
camera frame (resized to 1024 px)
+ question (speech-to-text) or audio  --> POST /api/ask  ------>   Gemini generateContent
                                          api/ask.js               (image + text/audio,
spoken answer (speech synthesis)      <-- { answer }  <---------    system prompt)
```

- `app.js` captures a frame, handles speech recognition (or records audio as a fallback), calls the backend and speaks the reply.
- `api/ask.js` is a Vercel serverless function. It adds the system prompt and calls the Gemini REST API. The API key lives only in a server environment variable and is never sent to the browser.
- No database, no accounts, no build step. Nothing is stored on the server; images and audio are sent to Gemini only to answer the current question.

## Project structure

```
contextcam/
├── api/
│   └── ask.js        Serverless function that calls Gemini
├── index.html        App markup
├── styles.css        High-contrast, mobile-first styles
├── app.js            Camera, voice input, speech output, API calls
├── vercel.json       Function timeout and security headers
├── package.json      Project metadata (no dependencies)
├── .env.example      Environment variable template
├── .gitignore
└── README.md
```

## Getting started

### Prerequisites

- A Gemini API key (free tier available): https://aistudio.google.com/apikey
- Node.js 18 or newer
- A GitHub account and a Vercel account (for deployment)

### Run locally

```bash
cp .env.example .env.local      # then paste your key into .env.local
npx vercel dev
```

Open the printed `localhost` address. Browsers allow camera and microphone access on `localhost` and on HTTPS only.

### Environment variables

| Variable         | Required | Default            | Description                                   |
| ---------------- | -------- | ------------------ | --------------------------------------------- |
| `GEMINI_API_KEY` | Yes      | none               | Your Google AI Studio API key                 |
| `GEMINI_MODEL`   | No       | `gemini-3.5-flash-lite` | Gemini model used for answers                 |

## Deploy

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "ContextCam"
git branch -M main
git remote add origin https://github.com/<your-username>/contextcam.git
git push -u origin main
```

### 2. Deploy on Vercel

1. Go to https://vercel.com/new and import the repository.
2. Leave the framework preset as **Other**; no build command or output directory is needed.
3. Under **Environment Variables**, add `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`).
4. Click **Deploy**.
5. Open the HTTPS URL on your phone and allow camera and microphone access.

## Using the app

1. Hold your phone steady, about 20 to 30 cm from the object, with good light.
2. Tap **Tap to ask**, speak your question, and tap again to send (or just stop talking where speech recognition ends automatically).
3. Listen to the answer. Use **Repeat** or **Stop speaking** as needed.
4. Tap **Describe scene** for a general summary with no question.
5. Open **Settings** to change speech speed and answer language.

### Keyboard shortcuts

| Key      | Action                          |
| -------- | ------------------------------- |
| `Space`  | Start or stop listening         |
| `Escape` | Stop speaking                   |

## Demo ideas

- Hold up a **foreign-language menu**: "Read this and translate it to English. What is vegetarian?"
- Show a **tangled set of cables**: "Which one is the USB-C cable and where is it?"
- Line up **three medicine bottles**: "Which one is the 50 milligram dose?"
- Point at a **street scene**: "What does the pedestrian signal show?"
- Use **Describe scene** in a new room for a quick overview.

## Browser support

| Feature                              | Chrome / Edge | Safari (iOS/macOS) | Firefox |
| ------------------------------------ | ------------- | ------------------ | ------- |
| Camera                               | Yes           | Yes                | Yes     |
| Speech recognition                   | Yes           | Yes (varies)       | No      |
| Audio recording fallback to Gemini   | Yes           | Yes                | Yes     |
| Spoken answers                       | Yes           | Yes                | Yes     |

Where speech recognition is unavailable, the app automatically records your question and Gemini listens to the audio directly.

## Privacy

- Camera frames and audio are sent to the Gemini API only when you ask a question.
- Nothing is saved by this app. Only your speech speed and language choice are kept, in your browser's local storage.
- Review Google's terms for the Gemini API for how your data is handled on their side.

## Limitations and safety

ContextCam can make mistakes, especially with small print, poor lighting or motion blur. It is an aid, not a replacement for human help.

- Always verify **medicine names and doses** with a pharmacist, label or another person.
- Never rely on it alone for **road crossing, traffic or other safety decisions**.
- Answers depend on what the camera can clearly see.

## Before sharing publicly

The `/api/ask` endpoint uses your Gemini quota. For a public launch:

- Set a spending or quota cap on your Google AI Studio project.
- Add rate limiting (for example Vercel WAF rules or Upstash Ratelimit).

## Troubleshooting

| Problem                          | Fix                                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| "Camera is blocked"              | Allow camera permission in the browser's site settings and reload. Use HTTPS or localhost. |
| "Server is missing GEMINI_API_KEY" | Add the variable in Vercel project settings and redeploy.                              |
| Microphone does nothing          | Allow microphone permission; on Firefox the audio fallback is used automatically.        |
| No spoken reply                  | Check device volume and that the browser allows speech synthesis; tap once on the page first. |
| Request fails with 429           | You hit the Gemini rate or quota limit; wait a moment or raise your quota.               |

## Tech stack

- Vanilla HTML, CSS and JavaScript (no framework, no build step)
- Web APIs: `getUserMedia`, Web Speech (recognition and synthesis), `MediaRecorder`, Web Audio, Vibration
- Vercel Serverless Functions (Node.js)
- Google Gemini API (`generateContent`, multimodal image + text/audio input)

## License

MIT
