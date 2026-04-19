require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = "google/gemini-2.0-flash-lite-001"; // free model

let totalCarbonSaved = 0;
let totalOptimizations = 0;

// Helper: count tokens (simple word-based estimate)
function countTokens(text) {
  return Math.ceil(text.split(/\s+/).length * 1.3);
}

// Helper: calculate CO2
function calculateCO2(tokens) {
  return parseFloat((tokens * 0.0003 * 0.45).toFixed(3));
}

// POST /api/v1/analyze
app.post('/api/v1/analyze', (req, res) => {
  const { raw_prompt } = req.body;
  if (!raw_prompt) return res.status(400).json({ error: "raw_prompt is required" });

  const token_count = countTokens(raw_prompt);
  const co2 = calculateCO2(token_count);
  const rating = co2 < 0.01 ? "green" : co2 < 0.05 ? "yellow" : "red";

  res.json({ co2_estimate: co2, token_count, rating });
});

// POST /api/v1/optimize
app.post('/api/v1/optimize', async (req, res) => {
  const { raw_prompt } = req.body;
  if (!raw_prompt) return res.status(400).json({ error: "raw_prompt is required" });

  const originalTokens = countTokens(raw_prompt);
  const originalCO2 = calculateCO2(originalTokens);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: "You are an environmental efficiency agent. Rewrite the following prompt to be as short as possible while retaining all functional requirements and intent. Return ONLY the rewritten text."
          },
          { role: "user", content: raw_prompt }
        ]
      })
    });

    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
    const optimizedText = data.choices[0].message.content;
    const optimizedTokens = countTokens(optimizedText);
    const optimizedCO2 = calculateCO2(optimizedTokens);
    const savings = parseFloat((originalCO2 - optimizedCO2).toFixed(3));
    const coins_reward = Math.floor(savings * 1000);
    totalCarbonSaved = parseFloat((totalCarbonSaved + savings).toFixed(3));
    totalOptimizations += 1;

    res.json({
      original: { text: raw_prompt, co2: originalCO2 },
      optimized: { text: optimizedText, co2: optimizedCO2 },
      savings,
      coins_reward
    });

  } catch (err) {
    res.status(500).json({ error: "Network Latency High", details: err.message });
  }
});
app.get('/api/v1/stats', (req, res) => {
  res.json({
    total_co2_saved: totalCarbonSaved,
    total_optimizations: totalOptimizations,
    trees_equivalent: parseFloat((totalCarbonSaved / 21000).toFixed(6))
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🌲 Nemora backend running on port ${PORT}`));
