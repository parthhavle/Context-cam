# ContextCam

A voice-first, high-contrast web app that lets blind and low-vision users point their phone camera at a scene, ask a question by voice or text, and hear a short spoken answer. Powered by the Google Gemini API.

Examples: "Which of these three bottles is the 50 mg dose?", "Read me this menu and translate it", "Which cable is the USB-C one?", "Does the crosswalk signal look safe?"

## How it works

- **Front end** (`index.html`, `styles.css`, `app.js`): live camera preview, giant tap targets, spoken answers via the Web Speech API, audio cues and vibration feedback, spacebar shortcut, adjustable speech speed and answer language.
- **Voice input**: uses the browser's speech recognition when available. If it is not (for example Firefox), the app records audio and sends it straight to Gemini, which hears the question itself.
- **Back end** (`api/ask.js`): a Vercel serverless function that sends the current camera frame plus the question (text and/or audio) to Gemini with a system prompt tuned for concise, spatial, safety-aware spoken answers. Your API key stays on the server.
- Short follow-up memory: the last few Q&A turns are sent as text so you can ask "and the one next to it?".

## Deploy

1. Get a free key at https://aistudio.google.com/apikey
2. Push this folder to a new GitHub repo:
   ```bash
   git init && git add . && git commit -m "ContextCam"
   git branch -M main
   git remote add origin https://github.com/<you>/contextcam.git
   git push -u origin main
   ```
3. Go to https://vercel.com/new, import the repo, keep the defaults (no build command, no framework).
4. In **Project Settings → Environment Variables** add `GEMINI_API_KEY`. Optionally add `GEMINI_MODEL` (default `gemini-2.5-flash`).
5. Deploy. Open the HTTPS URL on your phone and allow camera and microphone access.

Camera and microphone only work on HTTPS (Vercel provides this) or `localhost`.

## Run locally

```bash
cp .env.example .env.local   # then put your key in it
npx vercel dev
```

## Demo tips

- Hold up a foreign-language menu and ask "Read this and translate it to English."
- Tangled cables: "Which one looks like the HDMI cable and where is it?"
- Medicine bottles: tap the big button and ask "Which one is 50 milligrams?"
- Say or tap "Describe scene" for a full summary with no question.

## Safety note

ContextCam can make mistakes. For medicine doses, traffic and other safety-critical decisions it adds a caution, and users should verify with another person or a pharmacist.

## Before sharing publicly

The `/api/ask` endpoint spends your Gemini quota. For a public launch add rate limiting (for example Vercel WAF rules or Upstash Ratelimit) and set a spending cap on your Google AI Studio project.

## License

MIT
