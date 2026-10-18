const OpenAI = require('openai');

// Load the module without a key; the server validates configuration before starting a run.
const client = new OpenAI({
  baseURL: 'https://integrate.api.nvidia.com/v1',
  apiKey: process.env.NVIDIA_API_KEY || 'missing-key',
});

const MODEL = process.env.LLM_MODEL || 'nvidia/nemotron-3-super-120b-a12b';

/**
 * Complete a chat request, retrying twice after errors or empty output.
 */
async function chat(messages, { temperature = 0.4, maxTokens = 4096, signal } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const completion = await client.chat.completions.create({
        model: MODEL,
        messages,
        temperature,
        top_p: 1,
        max_tokens: maxTokens,
        stream: false,
      }, { signal });
      const content = completion.choices[0].message.content;
      if (content && content.trim()) return content;
      // Retry when the model returns an empty response.
      lastErr = new Error('The model returned an empty response.');
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    } catch (err) {
      lastErr = err;
      const msg = String(err.message || err);
      const retryable = /429|5\d\d|timeout|ECONN|overloaded/i.test(msg);
      if (!retryable || attempt === 2) break;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  throw lastErr;
}

module.exports = { chat, MODEL };
