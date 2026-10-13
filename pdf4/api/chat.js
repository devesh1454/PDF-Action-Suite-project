module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: { message: "Method not allowed." } });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: { message: "DeepSeek API key is not configured on the server." }
    });
  }

  const {
    model = "deepseek-chat",
    messages,
    stream = true,
    max_tokens = 1200,
    temperature = 0.15,
    top_p = 0.9,
    frequency_penalty = 0.1
  } = req.body || {};

  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: { message: "Invalid or missing messages array." } });
  }

  try {
    const upstreamResponse = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        stream,
        max_tokens,
        temperature,
        top_p,
        frequency_penalty
      })
    });

    if (!upstreamResponse.ok) {
      const errorBody = await upstreamResponse.text();
      return res.status(upstreamResponse.status).send(errorBody);
    }

    if (!stream) {
      return res.status(200).json(await upstreamResponse.json());
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const reader = upstreamResponse.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    return res.end();
  } catch (error) {
    console.error("DeepSeek proxy error:", error);
    if (!res.headersSent) {
      return res.status(502).json({ error: { message: "Unable to reach the AI service." } });
    }
    return res.end();
  }
};
