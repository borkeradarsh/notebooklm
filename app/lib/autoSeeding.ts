import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { PdfReader } from 'pdfreader';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Server-side Supabase client with service role key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

interface SeedingResult {
  success: boolean;
  notebookId?: string;
  documentsCreated?: number;
  error?: string;
}

/**
 * Automatically seeds sample documents for new users
 * Creates a default notebook and processes PDFs directly through database
 */
export async function seedNewUser(userId: string): Promise<SeedingResult> {
  try {
    console.log(`Starting automatic seeding for user: ${userId}`);

    // Check if user already has notebooks (avoid re-seeding)
    const { data: existingNotebooks } = await supabaseAdmin
      .from('notebooks')
      .select('id')
      .eq('user_id', userId);

    if (existingNotebooks && existingNotebooks.length > 0) {
      console.log('User already has notebooks, skipping seeding');
      return { success: true, documentsCreated: 0 };
    }

    // Create default notebook for sample content
    const { data: notebook, error: notebookError } = await supabaseAdmin
      .from('notebooks')
      .insert({
        user_id: userId,
        title: 'KEPH 107 - Welcome Collection',
        description: 'Sample educational documents to get you started with NotebookLM.',
        is_featured: true
      })
      .select()
      .single();

    if (notebookError || !notebook) {
      throw new Error(`Failed to create default notebook: ${notebookError?.message}`);
    }

    console.log(`Created default notebook: ${notebook.id}`);

    // Get seed folder path
    const seedFolderPath = path.join(process.cwd(), 'seed');
    
    if (!fs.existsSync(seedFolderPath)) {
      console.warn('Seed folder not found, skipping PDF seeding');
      return { success: true, notebookId: notebook.id, documentsCreated: 0 };
    }

    // Get all PDF files from seed folder
    const pdfFiles = fs.readdirSync(seedFolderPath)
      .filter(file => file.toLowerCase().endsWith('.pdf'));

    if (pdfFiles.length === 0) {
      console.warn('No PDF files found in seed folder');
      return { success: true, notebookId: notebook.id, documentsCreated: 0 };
    }

    console.log(`Found ${pdfFiles.length} PDF(s) to seed: ${pdfFiles.join(', ')}`);

    let documentsCreated = 0;

    // Process each PDF file by calling our internal processing function
    for (const fileName of pdfFiles) {
      try {
        console.log(`Processing: ${fileName}`);
        
        const filePath = path.join(seedFolderPath, fileName);
        
        // Call the internal seeding function that handles PDF processing
        const success = await processSeededPDF(filePath, fileName, notebook.id, userId);
        
        if (success) {
          console.log(`✅ Successfully seeded: ${fileName}`);
          documentsCreated++;
        } else {
          console.error(`Failed to process: ${fileName}`);
        }

        // Small delay between uploads to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (fileError) {
        console.error(`Error processing ${fileName}:`, fileError);
        // Continue with next file instead of failing entirely
      }
    }

    // Update notebook source count
    await supabaseAdmin
      .from('notebooks')
      .update({ source_count: documentsCreated })
      .eq('id', notebook.id);

    console.log(`✅ Seeding complete for user ${userId}: ${documentsCreated} documents created`);

    return {
      success: true,
      notebookId: notebook.id,
      documentsCreated
    };

  } catch (error) {
    console.error('Auto-seeding failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Check if a user needs seeding (has no notebooks)
 */
export async function userNeedsSeeding(userId: string): Promise<boolean> {
  try {
    const { data: notebooks } = await supabaseAdmin
      .from('notebooks')
      .select('id')
      .eq('user_id', userId)
      .limit(1);

    return !notebooks || notebooks.length === 0;
  } catch (error) {
    console.error('Error checking if user needs seeding:', error);
    return false;
  }
}

/**
 * Track seeding status to prevent duplicate attempts
 */
export async function markUserAsSeeded(userId: string, status: 'pending' | 'completed' | 'failed'): Promise<void> {
  try {
    // We'll use a simple approach - create a special notebook entry to track seeding
    // This could be improved with a dedicated seeding_status table
    await supabaseAdmin
      .from('notebooks')
      .upsert({
        user_id: userId,
        title: `__seeding_status_${status}__`,
        description: `Auto-seeding ${status} at ${new Date().toISOString()}`,
        is_featured: false
      });
  } catch (error) {
    console.error('Error marking user seeding status:', error);
  }
}

/**
 * PDF parsing function using pdfreader (copied from upload API)
 */
function parsePdfByPage(fileBuffer: Buffer): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const reader = new PdfReader(null);
    const pages: string[] = [];
    let currentPageText = '';

    reader.parseBuffer(fileBuffer, (err, item) => {
      if (err) {
        reject(err);
      } else if (!item) {
        if (currentPageText) pages.push(currentPageText.trim());
        resolve(pages);
      } else if (item.page) {
        if (currentPageText) pages.push(currentPageText.trim());
        currentPageText = '';
      } else if (item.text) {
        currentPageText += item.text + ' ';
      }
    });
  });
}

/**
 * Text chunking function (copied from upload API)
 */
const chunkText = (text: string, chunkSize = 1500, overlap = 200): string[] => {
  const chunks: string[] = [];
  if (!text) return chunks;
  for (let i = 0; i < text.length; i += chunkSize - overlap) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks.filter(chunk => chunk.trim().length > 50);
};

/**
 * Process a single PDF file for seeding (replicates upload API logic)
 */
async function processSeededPDF(
  filePath: string, 
  fileName: string, 
  notebookId: string, 
  userId: string
): Promise<boolean> {
  try {
    const googleApiKey = process.env.GOOGLE_API_KEY;
    if (!googleApiKey) {
      throw new Error("Missing GOOGLE_API_KEY environment variable");
    }

    const genAI = new GoogleGenerativeAI(googleApiKey);

    // Read the PDF file
    const fileBuffer = fs.readFileSync(filePath);
    
    // Create document record
    const { data: document, error: docError } = await supabaseAdmin
      .from('documents')
      .insert({ 
        user_id: userId, 
        filename: fileName, 
        status: 'processing', 
        notebook_id: notebookId,
        file_size: fileBuffer.length
      })
      .select()
      .single();

    if (docError) {
      console.error(`Failed to create document record: ${docError.message}`);
      return false;
    }

    console.log(`Created document record with ID: ${document.id}`);

    // Upload to Supabase Storage
    const fileExt = fileName.split('.').pop();
    const storageFileName = `${document.id}.${fileExt}`;
    const storagePath = `${userId}/${storageFileName}`;

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('documents')
      .upload(storagePath, fileBuffer, {
        contentType: 'application/pdf',
        upsert: false,
        cacheControl: '3600',
        metadata: {
          documentId: document.id,
          originalFilename: fileName,
          uploadedBy: userId,
          uploadedAt: new Date().toISOString()
        }
      });

    if (uploadError) {
      console.error('Error uploading file to storage:', uploadError);
      await supabaseAdmin.from('documents').delete().eq('id', document.id);
      return false;
    }

    // Update document with storage path
    await supabaseAdmin
      .from('documents')
      .update({ storage_path: uploadData.path })
      .eq('id', document.id);

    console.log(`File uploaded to storage: ${uploadData.path}`);

    // Parse PDF text
    const pageTexts = await parsePdfByPage(fileBuffer);
    const numPages = pageTexts.length;
    console.log(`PDF parsed: ${numPages} pages`);

    // Create chunks with metadata
    const chunksWithMetadata = pageTexts.flatMap((text, pageIndex) => {
      const chunks = chunkText(text);
      return chunks.map((content, chunkIndex) => ({
        document_id: document.id,
        page_number: pageIndex + 1,
        chunk_index: chunkIndex,
        content: content,
      }));
    });

    if (chunksWithMetadata.length === 0) {
      await supabaseAdmin.from('documents').update({ status: 'error', page_count: 0 }).eq('id', document.id);
      console.error('No text content extracted from PDF');
      return false;
    }

    console.log(`Created ${chunksWithMetadata.length} chunks`);

    // Generate embeddings
    const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
    const embeddings: number[][] = [];
    
    for (const chunk of chunksWithMetadata) {
      const embeddingResult = await embeddingModel.embedContent(chunk.content);
      embeddings.push(embeddingResult.embedding.values);
      
      // Small delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log("Generated embeddings for all chunks");

    // Prepare chunks with embeddings
    const documentsToInsert = chunksWithMetadata.map((chunk, index) => ({
      ...chunk,
      embedding: embeddings[index],
    }));

    // Insert chunks into database
    const { error: chunksError } = await supabaseAdmin
      .from('document_chunks')
      .insert(documentsToInsert);

    if (chunksError) {
      console.error('Error inserting chunks:', chunksError);
      return false;
    }

    // Update document status to ready
    await supabaseAdmin
      .from('documents')
      .update({ status: 'ready', page_count: numPages })
      .eq('id', document.id);

    console.log(`Document ${fileName} processed successfully`);
    return true;

  } catch (error) {
    console.error(`Error processing ${fileName}:`, error);
    return false;
  }
}