// ============================================================
// API: РАЗБОР ЗАДАНИЙ ПО ФОТО/СКРИНШОТУ (Groq Vision)
// ============================================================
// Использует Llama 3.2 Vision для анализа изображений с заданиями.
// Пользователь может сфоткать задание и получить пошаговый разбор.
// ============================================================

import { chatPrompts } from '../lib/prompts.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { role = 'student', messages, subject } = req.body || {};

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY не настроен' });

    // Системный промпт для разбора заданий по фото
    const systemPrompt = `Ты — эксперт NEVIO по разбору заданий ЦТ/ЦЭ Беларуси по фотографиям.

ТВОЯ ЗАДАЧА: На изображении — задание (ЦТ, ЦЭ, олимпиада, школьная контрольная).
Пользователь просит: "${subject || 'определи предмет сам и разбери задание'}"

АЛГОРИТМ РАЗБОРА:
1. Определи ПРЕДМЕТ (математика, физика, химия, биология, история Беларуси, русский язык, белорусский язык, английский язык, обществоведение, география, информатика).
2. Определи ТИП задания (часть А с выбором ответа / часть В с кратким ответом / задача с полным решением / тест / текст с вопросами).
3. ОПРЕДЕЛИ ФОРМАТ ЦТ/ЦЭ — это задание похоже на реальный экзамен?
4. ПЕРЕПИШИ условие задачи (на случай если текст на фото нечитаемый)
5. РЕШИ пошагово с ПОДРОБНЫМ объяснением каждого шага
6. ПОКАЖИ формулы и теоремы, которые применял
7. Дай ОТВЕТ чётко и однозначно
8. Укажи ТИПИЧНЫЕ ОШИБКИ при решении подобных задач
9. Если задание сложное — дай ПОДСКАЗКУ для запоминания алгоритма

Используй Markdown для форматирования: **жирный**, *курсив*, списки, формулы (x², √5, π, и т.д.).

Если на фото НЕ задание (или плохо видно) — попроси прислать более чёткое изображение или написать задание текстом.

Язык ответа: русский (если явно не указан белорусский).`;

    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.2-90b-vision-preview', // Vision-модель Groq
        messages: fullMessages,
        temperature: 0.4,
        max_tokens: 3500
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Groq Vision error:', response.status, errText);
      return res.status(response.status).json({
        error: `Groq Vision error: ${response.status}`,
        details: process.env.NODE_ENV === 'development' ? errText : undefined
      });
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content || '';

    return res.status(200).json({
      answer,
      model: 'llama-3.2-90b-vision-preview'
    });
  } catch (err) {
    console.error('Vision API error:', err);
    return res.status(500).json({ error: 'Internal error', message: err.message });
  }
}
