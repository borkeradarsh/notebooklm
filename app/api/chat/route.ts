import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

// Initialize AI at module level but defer Supabase client creation
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    // Create Supabase client inside the function to avoid build-time issues
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { message: question, selectedDocuments } = await request.json();
    
    const documentId = selectedDocuments && selectedDocuments[0];

    if (!question) {
      return NextResponse.json({ error: 'Question is required.' }, { status: 400 });
    }
    if (!documentId) {
      return NextResponse.json({ error: 'A selected document is required to provide context.' }, { status: 400 });
    }

    const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
    const embeddingResult = await embeddingModel.embedContent(question);
    const queryEmbedding = embeddingResult.embedding.values;

    const { data: documents, error: rpcError } = await supabase.rpc('search_document_chunks', {
      query_embedding: queryEmbedding,
      match_count: 5, // Find the top 5 most relevant chunks
      target_document_id: documentId,
    });

    if (rpcError) throw new Error(`Supabase RPC error: ${rpcError.message}`);
    
    if (!documents || documents.length === 0) {
        return NextResponse.json({ answer: "I'm sorry, I couldn't find any relevant information in the selected document to answer your question." });
    }

    const typedDocuments = documents as Array<{
      content: string;
      page_number: number;
      filename: string;
      similarity: number;
    }>;
    const context = typedDocuments.map(doc => `Source: ${doc.filename}, Page: ${doc.page_number}\nContent: ${doc.content}`).join('\n\n---\n\n');
    
    const prompt = `
      You are a helpful teaching assistant. Answer the user's question based ONLY on the following context.
      Your answer must be grounded in the provided sources.
      When you use information from a source, you MUST cite it by referencing the page number and quoting a 2-3 line snippet.
      Format citations like this: "According to p. {page_number} of {filename}: '{snippet}'"

      Context:
      ---
      ${context}
      ---

      Question: ${question}
    `;

    // Use the same model as the working quiz route
    const generativeModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await generativeModel.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    return NextResponse.json({ answer: text });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
    console.error('--- CHAT API CRASH ---', errorMessage);
    return NextResponse.json({ error: `Internal Server Error: ${errorMessage}` }, { status: 500 });
  }
}

