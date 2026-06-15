// ============================================================
// API: УНИВЕРСАЛЬНЫЙ ЧАТ (С ПОТОКОМ!)
// ============================================================
// Прокси для основного чата NEVIO. Поддерживает стриминг для
// красивого отображения ответа по мере генерации.
// ============================================================

import { chatPrompts } from '../lib/prompts.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { role = 'student', messages, stream = true, temperature = 0.6 } = req.body || {};

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY не настроен' });

    // Добавляем системный промпт в начало
    const systemPrompt = chatPrompts[role] || chatPrompts.student;
    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    if (stream) {
      // Стриминг
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: fullMessages,
          temperature,
          max_tokens: 4000,
          stream: true
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        res.status(response.status).write(`data: ${JSON.stringify({ error: `Groq error: ${response.status}` })}\n\n`);
        return res.end();
      }

      // Проксируем поток
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
      }

      res.end();
    } else {
      // Без стриминга
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: fullMessages,
          temperature,
          max_tokens: 4000,
          stream: false
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `Groq error: ${response.status}`, details: errText });
      }

      const data = await response.json();
      return res.status(200).json(data);
    }
  } catch (err) {
    console.error('Chat API error:', err);
    return res.status(500).json({ error: 'Internal error', message: err.message });
  }
}
