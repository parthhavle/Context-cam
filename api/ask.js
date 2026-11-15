// Vercel serverless function: proxies requests to the Gemini API so the
// API key never reaches the browser.

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

const SYSTEM_PROMPT = `You are ContextCam, a visual assistant for blind and low-vision people. The user points a phone camera at a scene and asks a question by voice or text. Your answer will be read aloud by a text-to-speech engine.

Rules:
- Be concise: usually 1-3 short sentences. Lead with the direct answer.
- Plain spoken language only. No markdown, bullet points, emoji, asterisks or special symbols.
- Use spatial language the user can act on: "left", "right", "center", "top shelf", "about an arm's length away", or clock positions ("at 2 o'clock").
- When asked to pick among several items (e.g. medicine bottles), read the relevant label text exactly, name which item matches and where it is.
- Read text in any language, then give the translation in the user's language. For menus, read the dishes relevant to the question and mention prices if visible.
- For safety questions (crosswalk signals, traffic, stairs, hot surfaces, expiry dates, medicine doses): state exactly what you see, say how confident you are, and add a brief caution to double check with another person or source when a mistake could cause harm. Never say it is definitely safe to cross a road.
- If the image is blurry, dark, cropped or the answer is not visible, say so and tell the user how to fix it, for example "Move the phone a bit further back" or "Turn on more light".
- If no question is given, briefly describe the most important things in the scene.
- Never invent text or details you cannot see.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res
      .status(500)
      .json({ error: "Server is missing GEMINI_API_KEY. Add it in your Vercel project settings." });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { image, imageMime, question, audio, audioMime, language, history } = body;

    if (!image && !question && !audio) {
      return res.status(400).json({ error: "Send an image, a question, or audio." });
    }

    const parts = [];
    if (image) {
      parts.push({ inlineData: { mimeType: imageMime || "image/jpeg", data: image } });
    }
    if (audio) {
      parts.push({ inlineData: { mimeType: audioMime || "audio/webm", data: audio } });
      parts.push({ text: "The audio above is the user's spoken question about the image. Answer it." });
    }
    if (question) {
      parts.push({ text: `User question: ${question}` });
    }
    if (!question && !audio) {
      parts.push({ text: "Describe what is in front of me." });
    }

    // Short text-only memory of the last few turns for follow-up questions.
    const contents = [];
    if (Array.isArray(history)) {
      for (const turn of history.slice(-4)) {
        if (turn && typeof turn.q === "string" && typeof turn.a === "string") {
          contents.push({ role: "user", parts: [{ text: turn.q.slice(0, 500) }] });
          contents.push({ role: "model", parts: [{ text: turn.a.slice(0, 800) }] });
        }
      }
    }
    contents.push({ role: "user", parts });

    const systemText = language
      ? `${SYSTEM_PROMPT}\n- Reply in this language: ${String(language).slice(0, 20)}.`
      : SYSTEM_PROMPT;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemText }] },
        contents,
        generationConfig: {
          maxOutputTokens: 400,
          // Gemini 2.5 uses thinkingBudget; Gemini 3.x uses thinkingLevel.
          thinkingConfig: MODEL.startsWith("gemini-2.5")
            ? { thinkingBudget: 0 }
            : { thinkingLevel: "minimal" },
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      const message = data?.error?.message || "Gemini request failed.";
      return res.status(response.status).json({ error: message });
    }

    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text || "")
        .join(" ")
        .trim() || "";

    if (!text) {
      const reason = data?.promptFeedback?.blockReason;
      return res.status(200).json({
        answer: reason
          ? "I could not answer that one. Please try pointing the camera somewhere else."
          : "I could not make out an answer. Please try again.",
      });
    }

    return res.status(200).json({ answer: text });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Something went wrong talking to Gemini." });
  }
}
