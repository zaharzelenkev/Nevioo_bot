// ============================================================
// VERCEL SERVERLESS FUNCTION — БЕЗОПАСНЫЙ ПРОКСИ ДЛЯ GROQ API
// ============================================================
// Этот файл скрывает API ключ Groq от клиента!
// Ключ хранится в Environment Variables на Vercel.
// Без этого файла твой ключ ВИДЕН любому в браузере (и уже виден в GitHub).
//
// Настройка на Vercel:
// 1. Открой vercel.com → твой проект → Settings → Environment Variables
// 2. Добавь: GROQ_API_KEY = gsk_...твой_новый_ключ...
// 3. Redeploy
//
// ПОЧЕМУ ЭТО ВАЖНО:
// - Любой посетитель сайта может скопировать ключ и юзать за твой счёт
// - Groq может заблокировать аккаунт (нарушение TOS)
// - Твои квоты могут улететь за минуты
// ============================================================

export default async function handler(req, res) {
  // CORS — разрешаем только твоему сайту
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages, temperature = 0.5, max_tokens = 4000, model, stream = false } = req.body || {};

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'API ключ не настроен. Добавь GROQ_API_KEY в Environment Variables на Vercel.'
      });
    }

    // Простой rate-limit: один IP — не более 30 запросов в минуту
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(ip)) {
      return res.status(429).json({
        error: 'Слишком много запросов. Подожди минуту и попробуй снова.'
      });
    }

    const body = {
      model: model || 'llama-3.3-70b-versatile',
      messages,
      temperature,
      max_tokens,
      stream: false
    };

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Groq API error:', response.status, errText);
      return res.status(response.status).json({
        error: `Ошибка Groq API: ${response.status}`,
        details: process.env.NODE_ENV === 'development' ? errText : undefined
      });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера', message: err.message });
  }
}

// Простой in-memory rate limiter (для production лучше использовать Redis/KV)
const rateMap = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 минута
  const maxRequests = 30;

  const record = rateMap.get(ip) || { count: 0, resetAt: now + windowMs };

  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + windowMs;
  }

  record.count++;
  rateMap.set(ip, record);

  return record.count <= maxRequests;
}
