import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

interface QuizQuestion {
  id: string;
  type: 'mcq' | 'saq' | 'laq';
  question: string;
  options?: string[];
  correct_answer: string;
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

interface QuizSubmission {
  questions: QuizQuestion[];
  userAnswers: {[key: string]: string};
}

interface QuizResult {
  isCorrect: boolean;
  explanation: string;
  userAnswer: string;
  correctAnswer: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: QuizSubmission = await request.json();
    const { questions, userAnswers } = body;

    if (!questions || !userAnswers || questions.length === 0) {
      return NextResponse.json({ error: 'Invalid quiz submission data' }, { status: 400 });
    }

    const results: {[key: string]: QuizResult} = {};

    // Process each question
    for (const question of questions) {
      const userAnswer = userAnswers[question.id] || '';
      const correctAnswer = question.correct_answer;
      
      let isCorrect = false;
      let explanation = question.explanation;

      // Check if answer is correct based on question type
      if (question.type === 'mcq') {
        // For MCQ, exact match with correct answer
        isCorrect = userAnswer.toLowerCase().trim() === correctAnswer.toLowerCase().trim();
      } else {
        // For SAQ/LAQ, use AI to evaluate the answer
        try {
          const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
          
          const evaluationPrompt = `
You are evaluating a student's answer to a question. Please determine if the answer is correct and provide a detailed explanation.

Question: ${question.question}
Correct Answer: ${correctAnswer}
Student's Answer: ${userAnswer}

Please respond with a JSON object in this format:
{
  "isCorrect": boolean,
  "explanation": "Detailed explanation of why the answer is correct or incorrect, and what the correct answer should include"
}

For short answer questions (SAQ), the student's answer should capture the key concepts even if not word-for-word.
For long answer questions (LAQ), evaluate based on completeness, accuracy, and understanding of key concepts.
`;

          const result = await model.generateContent(evaluationPrompt);
          const response = await result.response;
          const text = response.text();
          
          try {
            const evaluation = JSON.parse(text);
            isCorrect = evaluation.isCorrect;
            explanation = evaluation.explanation;
          } catch (parseError) {
            console.error('Error parsing AI evaluation:', parseError);
            // Fallback: simple string comparison for SAQ/LAQ
            isCorrect = userAnswer.toLowerCase().includes(correctAnswer.toLowerCase()) ||
                       correctAnswer.toLowerCase().includes(userAnswer.toLowerCase());
          }
        } catch (aiError) {
          console.error('Error evaluating answer with AI:', aiError);
          // Fallback: simple string comparison
          isCorrect = userAnswer.toLowerCase().includes(correctAnswer.toLowerCase()) ||
                     correctAnswer.toLowerCase().includes(userAnswer.toLowerCase());
        }
      }

      results[question.id] = {
        isCorrect,
        explanation,
        userAnswer,
        correctAnswer
      };
    }

    return NextResponse.json({ 
      success: true, 
      results,
      summary: {
        totalQuestions: questions.length,
        correctAnswers: Object.values(results).filter(r => r.isCorrect).length,
        score: Math.round((Object.values(results).filter(r => r.isCorrect).length / questions.length) * 100)
      }
    });

  } catch (error) {
    console.error('Error submitting quiz:', error);
    return NextResponse.json(
      { error: 'Failed to submit quiz' },
      { status: 500 }
    );
  }
}