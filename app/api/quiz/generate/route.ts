import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

// Helper function to get user ID from request
async function getUserIdFromRequest(request: NextRequest): Promise<string | null> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    const decoded = jwt.decode(token) as { sub?: string } | null;
    return decoded?.sub || null;
  } catch (error) {
    console.error('Error extracting user ID:', error);
    return null;
  }
}

// Initialize at module level like other working routes
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
    const googleApiKey = process.env.GOOGLE_API_KEY;

    if (!supabaseUrl || !supabaseServiceKey || !googleApiKey) {
      throw new Error("Missing required environment variables.");
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user ID from authentication
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      console.log('No user ID found in request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { notebookId, documentIds, questionCount = 5, types = ['mcq'] } = await request.json();

    console.log('Quiz generation request:', { notebookId, documentIds, questionCount, types, userId });

    if (!notebookId || !documentIds || documentIds.length === 0) {
      return NextResponse.json({ error: 'NotebookId and documentIds are required.' }, { status: 400 });
    }

    // First, let's check what documents are available for this user in this notebook
    const { data: availableDocuments, error: availableDocsError } = await supabase
      .from('documents')
      .select('id, filename')
      .eq('notebook_id', notebookId)
      .eq('user_id', userId);

    console.log('Available documents:', { availableDocuments, availableDocsError });

    // Use the first document for now (can be enhanced to combine multiple documents)
    const documentId = documentIds[0];

    // Get document metadata with user validation
    const { data: documentData, error: docError } = await supabase
      .from('documents')
      .select('filename, notebook_id, user_id')
      .eq('id', documentId)
      .eq('user_id', userId)
      .eq('notebook_id', notebookId)
      .single();

    console.log('Document fetch result:', { documentData: !!documentData, docError });

    if (docError || !documentData) {
      console.error('Document fetch error:', docError);
      return NextResponse.json({ 
        error: 'Document not found or access denied.', 
        debug: { 
          docError: docError?.message, 
          documentId, 
          userId, 
          notebookId 
        } 
      }, { status: 404 });
    }

    // Get document content from chunks table
    const { data: chunks, error: chunksError } = await supabase
      .from('document_chunks')
      .select('content')
      .eq('document_id', documentId)
      .order('chunk_index', { ascending: true });

    console.log('Chunks fetch result:', { chunksCount: chunks?.length, chunksError });

    if (chunksError || !chunks || chunks.length === 0) {
      return NextResponse.json({ 
        error: 'Document content not found or not processed yet.',
        debug: {
          chunksError: chunksError?.message,
          chunksCount: chunks?.length || 0
        }
      }, { status: 404 });
    }

    // Combine all chunks to form the complete document content
    const context = chunks.map(chunk => chunk.content).join('\n\n');
    
    // Generate quiz based on requested type
    const quizType = types[0]; // Use first type specified
    let typePrompt = '';
    
    if (quizType === 'mcq') {
      typePrompt = `Generate ${questionCount} Multiple Choice Questions. Each question should have 4 options and one correct answer.`;
    } else if (quizType === 'saq') {
      typePrompt = `Generate ${questionCount} Short Answer Questions. These should require brief, factual responses.`;
    } else if (quizType === 'laq') {
      typePrompt = `Generate ${questionCount} Long Answer Questions. These should require detailed explanations.`;
    }

    const prompt = `
      You are an expert quiz creator for students. Based ONLY on the document content below, create educational questions.

      ${typePrompt}

      Return a JSON object with a "questions" array. Each question should have:
      - "type": "${quizType}"
      - "question": The question text
      ${quizType === 'mcq' ? '- "options": Array of exactly 4 strings' : ''}
      - "correct_answer": The correct answer${quizType === 'mcq' ? ' (must exactly match one of the options)' : ''}
      - "explanation": Brief explanation of the correct answer
      - "difficulty": "easy", "medium", or "hard"

      Document: ${documentData.filename}
      ---
      ${context}
      ---

      Generate the quiz now as valid JSON.
    `;

    // Generate quiz using Gemini
    const generativeModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await generativeModel.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Clean up the response to ensure it's valid JSON
    const jsonResponse = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(jsonResponse);
    } catch (parseError) {
      console.error('Failed to parse AI response:', text, parseError);
      return NextResponse.json({ error: 'Failed to generate valid quiz format' }, { status: 500 });
    }

    // Validate and format the response
    if (!parsedResponse.questions || !Array.isArray(parsedResponse.questions)) {
      return NextResponse.json({ error: 'Invalid quiz format generated' }, { status: 500 });
    }

    // Add unique IDs and ensure proper formatting
    const formattedQuestions = parsedResponse.questions.map((q: unknown, index: number) => {
      const question = q as Record<string, unknown>;
      return {
        id: `quiz_${Date.now()}_${index}`,
        type: quizType,
        question: (question.question as string) || '',
        ...(quizType === 'mcq' && { options: (question.options as string[]) || [] }),
        correct_answer: (question.correct_answer as string) || '',
        explanation: (question.explanation as string) || '',
        difficulty: (question.difficulty as string) || 'medium'
      };
    });

    return NextResponse.json({ 
      success: true,
      questions: formattedQuestions
    });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred.';
    console.error('--- QUIZ API CRASH ---', errorMessage);
    return NextResponse.json({ error: `Internal Server Error: ${errorMessage}` }, { status: 500 });
  }
}

