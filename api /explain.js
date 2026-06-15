// ============================================================
// API: ОБЪЯСНЕНИЕ ТЕМЫ И РАЗБОР ЗАДАНИЙ
// ============================================================
// Специализированный endpoint для глубокого объяснения тем и
// пошагового разбора заданий (включая разбор по фото/скриншоту).
// ============================================================

import { chatPrompts } from '../lib/prompts.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { role = 'student', action, subject, topic, question, taskText, image } = req.body || {};

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY не настроен' });

    let systemPrompt = chatPrompts[role] || chatPrompts.student;
    let userPrompt = '';

    switch (action) {
      case 'explain_topic':
        // Подробное объяснение темы
        userPrompt = `Объясни тему "${topic}" по предмету "${subject}" для подготовки к ЦТ/ЦЭ в Беларуси.

ФОРМАТ ОТВЕТА:
1. Краткое определение (1-2 предложения)
2. Основные понятия и формулы/правила
3. 2-3 примера с полным решением (по уровню сложности: лёгкий → средний → сложный)
4. Типичные ошибки учеников (3-5)
5. Подсказки для запоминания

Ученик должен ПОНЯТЬ тему, а не просто заучить формулы. Используй аналогии из жизни.`;
        break;

      case 'solve_task':
        // Разбор конкретного задания
        userPrompt = `Разбери следующее задание по ${subject} (формат ЦТ Беларуси):

${taskText}

ОБЯЗАТЕЛЬНО:
1. Определи тип задания (часть А или часть В на ЦТ)
2. Укажи, какие темы/формулы нужны
3. Реши пошагово с ПОДРОБНЫМ объяснением каждого шага
4. Укажи типичные ошибки при решении подобных задач
5. Дай ПОДРОБНЫЙ комментарий, ПОЧЕМУ правильный ответ именно такой
6. Дай итоговый ОТВЕТ чётко

Не сокращай решение. Это учебный разбор, а не шпаргалка.`;
        break;

      case 'analyze_literature':
        // Анализ литературного произведения
        userPrompt = `Сделай анализ литературного произведения для подготовки к ЦТ/ЦЭ:

Произведение: ${taskText || topic}

ФОРМАТ АНАЛИЗА:
1. Автор, годы жизни, эпоха
2. Жанр, литературное направление
3. Тема и идея (в чём главный смысл)
4. Композиция (как построено произведение)
5. Главные герои и их характеристика
6. Художественные особенности (язык, образы, символы)
7. Значение произведения в литературе

Учти, что в Беларуси в программе — русская И белорусская литература.`;
        break;

      case 'make_lesson_plan':
        // План урока для учителя
        userPrompt = `Составь план урока для учителя белорусской школы.

Тема: ${topic}
Предмет: ${subject}
${taskText ? `Дополнительно: ${taskText}` : ''}

ПЛАН УРОКА должен включать:
1. Цели урока (обучающая, развивающая, воспитательная)
2. Тип урока (изучение нового / закрепление / обобщение и т.д.)
3. Оборудование
4. Ход урока по минутам:
   - Организационный момент (2–3 мин)
   - Проверка домашнего задания / актуализация знаний (5–7 мин)
   - Изучение нового материала (15–20 мин)
   - Первичное закрепление (10–12 мин)
   - Подведение итогов / рефлексия (3–5 мин)
   - Домашнее задание (2 мин)
5. Содержание каждого этапа (что говорит учитель, что делают ученики)

Учитывай возраст учеников и белорусскую программу.`;
        break;

      case 'generate_tasks':
        // Генератор заданий для учителя
        userPrompt = `Сгенерируй ${taskText?.count || 5} заданий по теме "${topic}" (предмет: ${subject}).

${taskText?.difficulty ? `Сложность: ${taskText.difficulty}` : ''}
${taskText?.includeAnswers ? 'Дай ответы и решения.' : ''}

Задания должны быть разноуровневыми (3 лёгких, 2 средних). Используй формат ЦТ/ЦЭ Беларуси.`;
        break;

      default:
        // Универсальный промпт
        userPrompt = taskText || question || topic || 'Помоги с задачей.';
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.6,
        max_tokens: 3500
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `Groq error: ${response.status}`, details: errText });
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content || '';

    return res.status(200).json({ answer, model: 'llama-3.3-70b-versatile' });
  } catch (err) {
    console.error('Explain API error:', err);
    return res.status(500).json({ error: 'Internal error', message: err.message });
  }
}
