// ============================================================
// API: ГЕНЕРАЦИЯ ТЕСТОВ ЦТ/ЦЭ
// ============================================================
// Специализированный endpoint для генерации тестовых вопросов.
// Использует расширенные промпты с форматом ЦТ РИКЗ.
// ============================================================

import { knowledgeBase } from '../lib/knowledge.js';
import { testPrompts } from '../lib/prompts.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { subject, count = 10, difficulty = 'смешанный', examType = 'ЦТ' } = req.body || {};

    if (!subject) return res.status(400).json({ error: 'subject is required' });

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY не настроен' });

    const knowledge = knowledgeBase[subject] || '';
    const prompt = testPrompts(subject, count, difficulty, examType, knowledge);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: testPrompts.systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.6,
        max_tokens: 6000
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `Groq error: ${response.status}`, details: errText });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const questions = parseTestQuestions(text);

    return res.status(200).json({
      questions,
      raw: text,
      count: questions.length
    });
  } catch (err) {
    console.error('Test generator error:', err);
    return res.status(500).json({ error: 'Internal error', message: err.message });
  }
}

// Парсер вопросов из ответа ИИ
function parseTestQuestions(text) {
  const questions = [];
  // Разделяем по маркеру
  const blocks = text.split(/###ВОПРОС###|###Вопрос\s*\d+###/i).filter(b => b.includes('ОТВЕТ'));

  for (const block of blocks) {
    try {
      const content = (block.indexOf('###КОНЕЦ###') > -1
        ? block.substring(0, block.indexOf('###КОНЕЦ###'))
        : block
      ).trim();

      const lines = content.split('\n').map(l => l.trim()).filter(Boolean);

      let qText = '';
      const options = [];
      let correct = '';
      let explanation = '';

      let phase = 'question';

      for (const line of lines) {
        // Варианты А), Б), В), Г)
        const optMatch = line.match(/^([АБВГ])[\)\.]\s*(.+)$/);
        if (optMatch) {
          options.push(optMatch[2].trim());
          phase = 'options';
          continue;
        }
        if (line.match(/^ОТВЕТ\s*[:\-]/i)) {
          const m = line.match(/([АБВГ])/);
          if (m) correct = m[1].toUpperCase();
          phase = 'answer';
          continue;
        }
        if (line.match(/^(ПОЯСНЕНИЕ|ОБЪЯСНЕНИЕ|EXPLANATION)\s*[:\-]/i)) {
          explanation = line.replace(/^(ПОЯСНЕНИЕ|ОБЪЯСНЕНИЕ|EXPLANATION)\s*[:\-]/i, '').trim();
          phase = 'explanation';
          continue;
        }
        if (phase === 'question') qText += (qText ? ' ' : '') + line;
        else if (phase === 'explanation') explanation += ' ' + line;
      }

      if (qText && options.length >= 4 && correct && 'АБВГ'.includes(correct)) {
        questions.push({
          question: qText,
          options: options.slice(0, 4),
          correct,
          explanation: explanation || 'Правильный ответ — ' + correct
        });
      }
    } catch (e) {
      console.error('Parse error:', e);
    }
  }
  return questions;
}
