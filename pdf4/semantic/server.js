const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables from .env
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'pdfsuite-backend',
    hasApiKey: Boolean(DEEPSEEK_API_KEY && DEEPSEEK_API_KEY !== 'your_deepseek_api_key_here')
  });
});

// Secure Chat & Semantic Search Proxy
app.post('/api/chat', async (req, res) => {
  try {
    const apiKey = DEEPSEEK_API_KEY;
    if (!apiKey || apiKey === 'your_deepseek_api_key_here') {
      return res.status(500).json({
        error: { message: 'DeepSeek API key is not configured in backend .env file.' }
      });
    }

    const {
      model = 'deepseek-chat',
      messages,
      stream = true,
      max_tokens = 1200,
      temperature = 0.15,
      top_p = 0.9,
      frequency_penalty = 0.1
    } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: { message: 'Invalid or missing messages array.' } });
    }

    const upstreamResponse = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
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
      const errBody = await upstreamResponse.text();
      return res.status(upstreamResponse.status).send(errBody);
    }

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const reader = upstreamResponse.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      return res.end();
    } else {
      const data = await upstreamResponse.json();
      return res.json(data);
    }
  } catch (error) {
    console.error('Proxy error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: { message: error.message || 'Internal proxy error' } });
    } else {
      res.end();
    }
  }
});

app.listen(PORT, () => {
  console.log(`[pdfSuite Backend] Secure API proxy running on http://localhost:${PORT}`);
  console.log(`[pdfSuite Backend] DeepSeek API Key loaded: ${DEEPSEEK_API_KEY ? 'Yes (Hidden)' : 'No'}`);
});
