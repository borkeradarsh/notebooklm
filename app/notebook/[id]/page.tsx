'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/app/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, FileText, ChevronLeft, MessageSquare, BookOpen, BarChart3, Play, Clock, Plus, Upload, CheckCircle, XCircle, ExternalLink, X } from 'lucide-react';
import { redirect } from 'next/navigation';
import dynamic from 'next/dynamic';

// Import react-pdf CSS for proper text and annotation rendering
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Import react-pdf CSS for text and annotation layers
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Dynamically import react-pdf components to avoid SSR issues
const Document = dynamic(() => import('react-pdf').then(mod => ({ default: mod.Document })), {
  ssr: false,
  loading: () => <div className="animate-spin w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full mx-auto" />
});

const Page = dynamic(() => import('react-pdf').then(mod => ({ default: mod.Page })), {
  ssr: false
});

// Configure PDF.js worker only on client side
if (typeof window !== 'undefined') {
  import('react-pdf').then(({ pdfjs }) => {
    // First try local worker file, then fallback to CDN
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
  }).catch(() => {
    console.warn('Failed to configure PDF.js worker');
  });
}

interface Document {
  id: string;
  filename: string;
  content_text: string;
  created_at: string;
  storage_path?: string;
  file_size?: number;
  status?: string;
}

interface Notebook {
  id: string;
  title: string;
  description: string;
}

interface Message {
  id: string;
  content: string;
  role: string;
  created_at: string;
}

interface QuizQuestion {
  id: string;
  type: 'mcq' | 'saq' | 'laq';
  question: string;
  options?: string[];
  correct_answer: string;
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

interface QuizResult {
  isCorrect: boolean;
  explanation: string;
  userAnswer: string;
  correctAnswer: string;
}

interface VideoRecommendation {
  title: string;
  search_query: string;
}

// Unique Tab Button Component
const TabButton = ({ icon: Icon, label, active, onClick }: { 
  icon: React.ComponentType<{ className?: string }>, 
  label: string, 
  active: boolean,
  onClick?: () => void
}) => (
  <motion.button
    whileHover={{ scale: 1.03, y: -1 }}
    whileTap={{ scale: 0.97 }}
    onClick={onClick}
    className={`relative flex flex-col items-center px-3 py-2.5 rounded-xl font-medium transition-all duration-500 flex-1 group overflow-hidden ${
      active 
        ? 'text-white' 
        : 'text-slate-400 hover:text-slate-200'
    }`}
  >
    {/* Unique background for active tab */}
    {active && (
      <>
        <motion.div
          layoutId="activeTabBg"
          className="absolute inset-0 bg-gradient-to-br from-blue-500/80 via-purple-500/70 to-pink-500/60 rounded-xl"
          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-blue-400/20 via-purple-400/20 to-pink-400/20 rounded-xl blur-sm" />
      </>
    )}
    
    {/* Hover effect for inactive tabs */}
    {!active && (
      <div className="absolute inset-0 bg-gradient-to-br from-slate-700/0 to-slate-600/0 group-hover:from-slate-700/30 group-hover:to-slate-600/30 rounded-xl transition-all duration-500" />
    )}
    
    <Icon className={`w-4 h-4 mb-1.5 relative z-10 transition-all duration-300 ${
      active ? 'text-white drop-shadow-lg' : 'group-hover:scale-110 group-hover:text-slate-200'
    }`} />
    <span className={`text-xs relative z-10 transition-all duration-300 font-medium ${
      active ? 'text-white drop-shadow-sm font-semibold' : 'group-hover:font-semibold'
    }`}>
      {label}
    </span>
    
    {/* Unique active indicator */}
    {active && (
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="absolute -top-0.5 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-white rounded-full shadow-lg"
      />
    )}
  </motion.button>
);



export default function NotebookPage({ params }: { params: Promise<{ id: string }> }) {
  const [notebookId, setNotebookId] = useState<string | null>(null);
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [activeTab, setActiveTab] = useState<'quiz' | 'progress' | 'videos'>('quiz');
  
  // Responsive tab state for mobile/tablet navigation
  const [responsiveActiveTab, setResponsiveActiveTab] = useState<'sources' | 'chat' | 'studio'>('chat');
  
  // XL sidebar toggle state
  const [isXlSidebarOpen, setIsXlSidebarOpen] = useState(true);
  
  // PDF viewer state
  const [isPdfOpen, setIsPdfOpen] = useState(false);
  const [selectedPdfDocument, setSelectedPdfDocument] = useState<Document | null>(null);
  const [pdfNumPages, setPdfNumPages] = useState<number | null>(null);
  const [pdfPageNumber, setPdfPageNumber] = useState(1);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfZoom, setPdfZoom] = useState(1.3); // PDF zoom level - ADJUST THIS VALUE
  
  // Chat state
  const [chatSessions, setChatSessions] = useState<{id: string, title: string, created_at: string, messageCount: number}[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  
  // Quiz state
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [selectedQuizType, setSelectedQuizType] = useState<'MCQ' | 'SAQ' | 'LAQ'>('MCQ');

  const [userAnswers, setUserAnswers] = useState<{[key: string]: string}>({});
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [isSubmittingQuiz, setIsSubmittingQuiz] = useState(false);
  const [quizResults, setQuizResults] = useState<{[key: string]: {isCorrect: boolean, explanation: string}} | null>(null);
  const [showResults, setShowResults] = useState(false);
  
  // Progress tracking state
  const [progressData, setProgressData] = useState<{
    attempts: Array<{
      id: string;
      created_at: string;
      quiz_topic: string;
      quiz_type: string;
      score: number;
      total_questions: number;
      correct_answers: number;
    }>;
    statistics: {
      totalAttempts: number;
      averageScore: number;
      totalCorrectAnswers: number;
      totalQuestions: number;
      quizTypeBreakdown: Record<string, number>;
      recentActivity: Array<{
        id: string;
        created_at: string;
        quiz_topic: string;
        quiz_type: string;
        score: number;
      }>;
    };
  } | null>(null);
  const [isLoadingProgress, setIsLoadingProgress] = useState(false);
  
  // YouTube video recommendations state
  const [videoRecommendations, setVideoRecommendations] = useState<VideoRecommendation[]>([]);
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);
  const [videoTopic, setVideoTopic] = useState('');

  // Ref for scrolling to bottom
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Ref for file input
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Upload state
  const [isUploading, setIsUploading] = useState(false);

  // Scroll to bottom function
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    params.then(({ id }) => setNotebookId(id));
  }, [params]);

  const createNewChat = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !notebookId) return;

      // Create a new chat session ID
      const newChatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newChatTitle = 'New Chat';
      
      // Add to chat sessions
      const newSession = {
        id: newChatId,
        title: newChatTitle,
        created_at: new Date().toISOString(),
        messageCount: 0
      };
      
      setChatSessions(prev => [newSession, ...prev]);
      setCurrentChatId(newChatId);
      setMessages([]);
      
      // Save to localStorage for persistence
      const savedSessions = JSON.parse(localStorage.getItem(`chat_sessions_${notebookId}`) || '[]');
      savedSessions.unshift(newSession);
      localStorage.setItem(`chat_sessions_${notebookId}`, JSON.stringify(savedSessions));
      
    } catch (error) {
      console.error('Error creating new chat:', error);
    }
  }, [notebookId]);

  // Function to generate intelligent chat title based on content
  const generateChatTitle = useCallback((message: string): string => {
    // Remove extra whitespace and limit length
    const cleanMessage = message.trim().slice(0, 80);
    
    if (!cleanMessage) return 'New Chat';
    
    // Common academic/professional patterns
    const patterns = [
      { regex: /explain|tell me about|what is|what are/i, prefix: 'About ' },
      { regex: /how to|how do|how can/i, prefix: 'How to ' },
      { regex: /why does|why is|why are/i, prefix: 'Why ' },
      { regex: /when should|when to|when is/i, prefix: 'When ' },
      { regex: /where can|where is|where are/i, prefix: 'Where ' },
      { regex: /help me|help with|assist/i, prefix: 'Help with ' },
      { regex: /analyze|analysis/i, prefix: 'Analysis: ' },
      { regex: /compare|comparison/i, prefix: 'Comparison: ' },
      { regex: /summarize|summary/i, prefix: 'Summary: ' },
      { regex: /review|evaluate/i, prefix: 'Review: ' }
    ];
    
    // Check for patterns
    for (const pattern of patterns) {
      if (pattern.regex.test(cleanMessage)) {
        const mainPart = cleanMessage.replace(pattern.regex, '').trim();
        const words = mainPart.split(' ').slice(0, 4).join(' ');
        return pattern.prefix + words;
      }
    }
    
    // If it's a question, use it as is (truncated)
    if (cleanMessage.includes('?')) {
      const question = cleanMessage.split('?')[0];
      return question.length > 50 ? question.slice(0, 47) + '...?' : question + '?';
    }
    
    // For statements, extract key topic
    const words = cleanMessage.split(' ');
    
    // If short enough, use as is
    if (words.length <= 6) {
      return cleanMessage;
    }
    
    // Look for important keywords to build title around
    const importantWords = words.filter(word => 
      word.length > 3 && 
      !['this', 'that', 'with', 'from', 'they', 'them', 'have', 'been', 'were', 'will', 'would', 'could', 'should'].includes(word.toLowerCase())
    );
    
    if (importantWords.length > 0) {
      return importantWords.slice(0, 3).join(' ') + (importantWords.length > 3 ? '...' : '');
    }
    
    // Fallback: first 5 words
    return words.slice(0, 5).join(' ') + (words.length > 5 ? '...' : '');
  }, []);

  // Function to generate title based on conversation context
  const generateConversationTitle = useCallback((userMsg: string, aiResponse: string): string => {
    // Try to extract topic from AI response if it's more informative
    const aiWords = aiResponse.toLowerCase();
    
    // Look for key topics in AI response
    const topicKeywords = ['about', 'regarding', 'concerning', 'explains', 'discusses', 'describes'];
    for (const keyword of topicKeywords) {
      const index = aiWords.indexOf(keyword);
      if (index !== -1) {
        const afterKeyword = aiResponse.slice(index + keyword.length).trim();
        const topic = afterKeyword.split(/[.!?]/)[0].slice(0, 40);
        if (topic.length > 3) {
          return topic.charAt(0).toUpperCase() + topic.slice(1);
        }
      }
    }
    
    // Fallback to user message processing
    return generateChatTitle(userMsg);
  }, [generateChatTitle]);

  // Function to update chat title after first message
  const updateChatTitle = useCallback((chatId: string, newTitle: string) => {
    setChatSessions(prev => {
      const updated = prev.map(chat => 
        chat.id === chatId ? { ...chat, title: newTitle } : chat
      );
      
      // Save to localStorage
      localStorage.setItem(`chat_sessions_${notebookId}`, JSON.stringify(updated));
      return updated;
    });
  }, [notebookId]);

  const switchChat = useCallback((chatId: string) => {
    setCurrentChatId(chatId);
    
    // Load messages for this specific chat session from localStorage
    const loadChatMessages = () => {
      try {
        const savedMessages = JSON.parse(localStorage.getItem(`chat_messages_${notebookId}_${chatId}`) || '[]');
        setMessages(savedMessages);
      } catch (error) {
        console.error('Error loading chat messages:', error);
        setMessages([]);
      }
    };
    
    loadChatMessages();
  }, [notebookId]);

  const loadNotebookData = useCallback(async () => {
    if (!notebookId) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        redirect('/login');
        return;
      }

      const { data: notebookData, error: notebookError } = await supabase
        .from('notebooks')
        .select('*')
        .eq('id', notebookId)
        .eq('user_id', user.id)
        .single();

      if (notebookError || !notebookData) {
        redirect('/dashboard');
        return;
      }

      setNotebook(notebookData);

      const { data: documentsData } = await supabase
        .from('documents')
        .select('id, filename, content_text, created_at, storage_path, file_size, status, notebook_id, user_id')
        .eq('notebook_id', notebookId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      setDocuments(documentsData || []);

      // Auto-select document if there's only one
      if (documentsData && documentsData.length === 1) {
        setSelectedDocuments([documentsData[0].id]);
      }

      // Load messages
      const { data: messagesData } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('notebook_id', notebookId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      setMessages(messagesData || []);
      
      // Always try to load saved chat sessions from localStorage first
      const savedSessions = JSON.parse(localStorage.getItem(`chat_sessions_${notebookId}`) || '[]');
      
      if (savedSessions.length > 0) {
        // Use saved chat sessions with their proper titles
        setChatSessions(savedSessions);
        setCurrentChatId(savedSessions[0].id);
        
        // Load messages for the first chat session
        const firstChatMessages = JSON.parse(localStorage.getItem(`chat_messages_${notebookId}_${savedSessions[0].id}`) || '[]');
        setMessages(firstChatMessages);
      } else if (messagesData && messagesData.length > 0) {
        // Fallback: create a single chat with all existing messages
        const fallbackChat = {
          id: 'current',
          title: 'Chat History',
          created_at: messagesData[0].created_at,
          messageCount: messagesData.length
        };
        setChatSessions([fallbackChat]);
        setCurrentChatId('current');
        setMessages(messagesData);
        
        // Save this fallback chat to localStorage
        localStorage.setItem(`chat_sessions_${notebookId}`, JSON.stringify([fallbackChat]));
        localStorage.setItem(`chat_messages_${notebookId}_current`, JSON.stringify(messagesData));
      } else {
        // No messages at all - create empty state
        setChatSessions([]);
        setCurrentChatId(null);
        setMessages([]);
      }
    } catch (error) {
      console.error('Error loading notebook data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [notebookId]);

  useEffect(() => {
    loadNotebookData();
  }, [loadNotebookData]);

  // Ensure we have at least one chat session after loading
  useEffect(() => {
    if (!isLoading && chatSessions.length === 0 && notebookId) {
      // Auto-create first chat if none exists
      createNewChat();
    }
  }, [isLoading, chatSessions.length, notebookId, createNewChat]);

  // Function to check and trigger document embedding for RAG
  const ensureDocumentsEmbedded = useCallback(async () => {
    if (!notebookId || documents.length === 0) return;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Check if documents need embedding and process them
      const embeddingPromises = documents.map(async (doc) => {
        try {
          const response = await fetch('/api/documents/embed', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.access_token}`,
            },
            body: JSON.stringify({
              documentId: doc.id
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
          }

          const result = await response.json();
          console.log(`Embedding check for ${doc.filename}:`, result);
          return { document: doc.filename, ...result };
        } catch (error) {
          console.error(`Failed to check/embed document ${doc.filename}:`, error);
          return { document: doc.filename, error: error instanceof Error ? error.message : 'Unknown error' };
        }
      });

      const results = await Promise.all(embeddingPromises);
      console.log('Document embedding status:', results);
      
      return results;
    } catch (error) {
      console.error('Error in ensureDocumentsEmbedded:', error);
    }
  }, [notebookId, documents]);

  // Automatically check document embedding when documents are loaded
  useEffect(() => {
    if (documents.length > 0 && notebookId) {
      // Delay to let the component fully load
      setTimeout(() => {
        ensureDocumentsEmbedded();
      }, 2000);
    }
  }, [documents, notebookId, ensureDocumentsEmbedded]);

  const sendMessage = async () => {
    if (!newMessage.trim() || isSending || !notebookId) return;
    
    // Ensure we have a current chat session
    if (!currentChatId) {
      await createNewChat();
      // Wait a bit for state to update
      setTimeout(() => sendMessage(), 100);
      return;
    }

    setIsSending(true);
    const userMessage = newMessage.trim();
    setNewMessage('');

    // Scroll to bottom immediately when user sends a message
    setTimeout(() => scrollToBottom(), 100);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Save user message to database
      const { data: userMessageData } = await supabase
        .from('chat_messages')
        .insert({
          notebook_id: notebookId,
          content: userMessage,
          role: 'user',
          user_id: user.id
        })
        .select()
        .single();

      if (userMessageData) {
        const tempUserMessage: Message = {
          id: userMessageData.id,
          content: userMessage,
          role: 'user',
          created_at: userMessageData.created_at
        };
        setMessages(prev => {
          const newMessages = [...prev, tempUserMessage];
          // Save to localStorage for this specific chat
          localStorage.setItem(`chat_messages_${notebookId}_${currentChatId}`, JSON.stringify(newMessages));
          
          // Update chat session with new message count and title
          setChatSessions(prev => {
            const updated = prev.map(chat => 
              chat.id === currentChatId 
                ? { ...chat, messageCount: newMessages.length }
                : chat
            );
            localStorage.setItem(`chat_sessions_${notebookId}`, JSON.stringify(updated));
            return updated;
          });
          
          // If this is the first message in the chat, update chat title
          if (newMessages.length === 1) {
            const intelligentTitle = generateChatTitle(userMessage);
            updateChatTitle(currentChatId, intelligentTitle);
          }
          
          return newMessages;
        });
      }

      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          message: userMessage,
          notebookId: notebookId!,
          selectedDocuments,
          userId: user.id
        }),
      });

      const data = await response.json();

      if (data.error) {
        console.error('Chat API error:', data.error);
        // You could show an error message to the user here
        return;
      }

      if (data.answer) {
        // Save AI response to database
        const { data: aiMessageData } = await supabase
          .from('chat_messages')
          .insert({
            notebook_id: notebookId,
            content: data.answer,
            role: 'assistant',
            user_id: user.id
          })
          .select()
          .single();

        if (aiMessageData) {
          const aiMessage: Message = {
            id: aiMessageData.id,
            content: data.answer,
            role: 'assistant',
            created_at: aiMessageData.created_at
          };
          setMessages(prev => {
            const newMessages = [...prev, aiMessage];
            // Save to localStorage for this specific chat
            localStorage.setItem(`chat_messages_${notebookId}_${currentChatId}`, JSON.stringify(newMessages));
            
            // Update chat session message count
            setChatSessions(prev => {
              const updated = prev.map(chat => 
                chat.id === currentChatId 
                  ? { ...chat, messageCount: newMessages.length }
                  : chat
              );
              localStorage.setItem(`chat_sessions_${notebookId}`, JSON.stringify(updated));
              return updated;
            });
            
            // If this is the second message (first AI response), potentially improve the title
            if (newMessages.length === 2) {
              const currentSession = chatSessions.find(chat => chat.id === currentChatId);
              if (currentSession && (currentSession.title === 'New Chat' || currentSession.title.startsWith('About ') || currentSession.title.startsWith('How to '))) {
                // Generate a better title based on the conversation context
                const improvedTitle = generateConversationTitle(userMessage, data.answer);
                updateChatTitle(currentChatId, improvedTitle);
              }
            }
            
            return newMessages;
          });
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsSending(false);
    }
  };



  const generateQuizWithType = async (quizType: 'MCQ' | 'SAQ' | 'LAQ') => {
    if (!notebookId || selectedDocuments.length === 0) return;
    
    setIsGeneratingQuiz(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('No authenticated user');
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.error('No access token available');
        return;
      }
      
      const response = await fetch('/api/quiz/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          notebookId,
          documentIds: selectedDocuments,
          questionCount: 5,
          types: [quizType.toLowerCase()]
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Quiz generation failed:', errorData);
        return;
      }

      const data = await response.json();
      if (data.questions) {
        setQuizQuestions(data.questions);
        setUserAnswers({});
        // Clear previous quiz results and submission state
        setQuizResults(null);
        setShowResults(false);
        setIsSubmittingQuiz(false);
      }
    } catch (error) {
      console.error('Error generating quiz:', error);
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  const handleAnswer = (questionId: string, answer: string) => {
    setUserAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  // Load progress data
  const loadProgressData = useCallback(async () => {
    if (!notebookId) return;
    
    setIsLoadingProgress(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch(`/api/progress?notebookId=${notebookId}&limit=20`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setProgressData(data);
      }
    } catch (error) {
      console.error('Error loading progress:', error);
    } finally {
      setIsLoadingProgress(false);
    }
  }, [notebookId]);

  // Load progress when notebook changes or tab becomes active
  useEffect(() => {
    if (activeTab === 'progress' && notebookId) {
      loadProgressData();
    }
  }, [activeTab, notebookId, loadProgressData]);

  // Load video recommendations based on selected documents or custom topic
  const loadVideoRecommendations = useCallback(async () => {
    // Need either a selected document or a custom topic
    if (!videoTopic.trim() && selectedDocuments.length === 0) return;
    
    setIsLoadingVideos(true);
    try {
      let documentContent = '';
      let topic = videoTopic.trim();

      // If we have selected documents, get their content
      if (selectedDocuments.length > 0) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const documentId = selectedDocuments[0];
        
        // Fetch document content from chunks
        const { data: chunks, error: chunksError } = await supabase
          .from('document_chunks')
          .select('content')
          .eq('document_id', documentId)
          .order('chunk_index', { ascending: true });

        if (!chunksError && chunks && chunks.length > 0) {
          // Combine all chunks to form the complete document content
          documentContent = chunks.map(chunk => chunk.content).join('\n\n');
          
          // If no custom topic provided, use document filename
          if (!topic) {
            const selectedDoc = documents.find(doc => doc.id === documentId);
            topic = selectedDoc?.filename?.replace(/\.(pdf|txt|doc|docx)$/i, '') || 'Study Material';
          }
        }
      }

      const response = await fetch('/api/youtube', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          documentContent: documentContent || undefined,
          topic: topic || 'General Study Topics'
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.videos) {
          setVideoRecommendations(data.videos);
        }
      } else {
        console.error('Failed to load video recommendations');
      }
    } catch (error) {
      console.error('Error loading video recommendations:', error);
    } finally {
      setIsLoadingVideos(false);
    }
  }, [selectedDocuments, documents, videoTopic]);

  // Update video topic when selected documents change
  useEffect(() => {
    if (selectedDocuments.length > 0) {
      const selectedDoc = documents.find(doc => selectedDocuments.includes(doc.id));
      const topic = selectedDoc?.filename?.replace(/\.(pdf|txt|doc|docx)$/i, '') || 'General Study Topics';
      setVideoTopic(topic);
      // Clear previous recommendations when document changes
      setVideoRecommendations([]);
    } else {
      setVideoTopic('');
      setVideoRecommendations([]);
    }
  }, [selectedDocuments, documents]);

  // Generate video recommendations based on documents when videos tab becomes active
  useEffect(() => {
    if (activeTab === 'videos' && selectedDocuments.length > 0 && videoRecommendations.length === 0) {
      loadVideoRecommendations();
    }
  }, [activeTab, selectedDocuments, videoRecommendations.length, loadVideoRecommendations]);

  const submitQuiz = async () => {
    if (!notebookId || quizQuestions.length === 0) return;
    
    setIsSubmittingQuiz(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('No authenticated user');
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.error('No access token available');
        return;
      }

      const response = await fetch('/api/quiz/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          notebookId,
          questions: quizQuestions,
          userAnswers,
          documentIds: selectedDocuments
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Quiz submission failed:', errorData);
        return;
      }

      const data = await response.json();
      if (data.success) {
        setQuizResults(data.results);
        const results = data.results as Record<string, QuizResult>;
        const correctCount = Object.values(results).filter(r => r.isCorrect).length;
        const totalQuestions = quizQuestions.length;
        const score = Math.round((correctCount / totalQuestions) * 100);
        
        setShowResults(true);
        
        // Save progress to tracking API
        try {
          const progressResponse = await fetch('/api/progress', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              notebookId,
              documentId: selectedDocuments[0] || null, // Use first selected document
              quizTopic: `${selectedQuizType} Quiz - ${new Date().toLocaleDateString()}`,
              quizType: selectedQuizType.toLowerCase(),
              questions: quizQuestions,
              userAnswers,
              score,
              totalQuestions,
              correctAnswers: correctCount
            }),
          });
          
          if (progressResponse.ok) {
            console.log('Progress saved successfully');
          } else {
            console.error('Failed to save progress');
          }
        } catch (progressError) {
          console.error('Error saving progress:', progressError);
        }
      }
    } catch (error) {
      console.error('Error submitting quiz:', error);
    } finally {
      setIsSubmittingQuiz(false);
    }
  };

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !notebookId) return;

    setIsUploading(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      for (const file of Array.from(files)) {
        if (file.type !== 'application/pdf') continue;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('notebookId', notebookId);

        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: formData,
        });

        if (!response.ok) {
          console.error('Upload failed for:', file.name);
          continue;
        }

        const result = await response.json();
        if (result.success) {
          // Refresh documents after successful upload
          loadNotebookData();
        }
      }
    } catch (error) {
      console.error('Error uploading files:', error);
    } finally {
      setIsUploading(false);
      // Reset the input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Trigger file selection
  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const toggleDocumentSelection = (docId: string) => {
    setSelectedDocuments(prev => 
      prev.includes(docId) 
        ? prev.filter(id => id !== docId)
        : [...prev, docId]
    );
  };

  // Handle PDF opening with proper authentication
  const handlePdfOpen = async (doc: Document) => {
    try {
      // Check if document has any PDF data available
      if (!doc.storage_path && !doc.content_text) {
        console.error('Document has no PDF data available:', doc.filename);
        return; // Don't attempt to open
      }

      setSelectedPdfDocument(doc);
      setIsPdfOpen(true);
      setPdfPageNumber(1);
      setPdfNumPages(null);
      
      // If document has storage path, fetch the PDF with authentication
      if (doc.storage_path) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          throw new Error('No authentication token available');
        }
        
        const response = await fetch(`/api/documents/${doc.id}/pdf`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch PDF');
        }
        
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        setPdfBlobUrl(blobUrl);
      } else {
        // Legacy documents with base64 content
        setPdfBlobUrl(null);
      }
    } catch (error) {
      console.error('Error opening PDF:', error);
      setIsPdfOpen(false);
      setSelectedPdfDocument(null);
    }
  };

  // Cleanup blob URL when PDF is closed
  useEffect(() => {
    return () => {
      if (pdfBlobUrl) {
        URL.revokeObjectURL(pdfBlobUrl);
      }
    };
  }, [pdfBlobUrl]);

  // Cleanup blob URL when component unmounts
  useEffect(() => {
    return () => {
      if (pdfBlobUrl) {
        URL.revokeObjectURL(pdfBlobUrl);
      }
    };
  }, [pdfBlobUrl]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-slate-950 flex flex-col xl:flex-row overflow-hidden">
      {/* Responsive Tab Navigation - Only visible on lg and smaller screens */}
      <div className="xl:hidden bg-slate-900/95 border-b border-slate-700/50 p-4">
        <div className="flex justify-center gap-1 bg-slate-800/50 rounded-2xl p-1">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setResponsiveActiveTab('sources')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium text-sm transition-all duration-300 ${
              responsiveActiveTab === 'sources'
                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">Sources</span>
          </motion.button>
          
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setResponsiveActiveTab('chat')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium text-sm transition-all duration-300 ${
              responsiveActiveTab === 'chat'
                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span className="hidden sm:inline">Chat</span>
          </motion.button>
          
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setResponsiveActiveTab('studio')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium text-sm transition-all duration-300 ${
              responsiveActiveTab === 'studio'
                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span className="hidden sm:inline">Studio</span>
          </motion.button>
        </div>
      </div>

      {/* Left Sidebar - Documents & Chat History */}
      <div className={`w-full xl:flex-shrink-0 bg-gradient-to-br from-gray-950/98 via-gray-900/95 to-slate-950/98 backdrop-blur-xl flex flex-col xl:h-full transition-all duration-700 ease-in-out ${
        responsiveActiveTab === 'sources' ? 'flex min-h-0' : 'hidden xl:flex'
      } ${
        isPdfOpen 
          ? 'xl:w-[35vw]' 
          : isXlSidebarOpen 
            ? 'xl:w-80' 
            : 'xl:w-16'
      }`}>
        {/* Enhanced Header with Toggle */}
        <div className={`p-4 xl:p-6 ${isPdfOpen ? 'hidden' : ''}`}>
          {/* XL Screen Header */}
          <div className="hidden xl:block">
            <div className="flex items-center justify-between mb-4">
              {isXlSidebarOpen && (
                <motion.button
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  whileHover={{ x: -4, scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => window.history.back()}
                  className="flex items-center text-slate-400 hover:text-blue-400 transition-all duration-300 p-2 rounded-xl hover:bg-blue-500/10"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </motion.button>
              )}
              
              <motion.button
                whileHover={{ scale: 1.1, rotate: 180 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setIsXlSidebarOpen(!isXlSidebarOpen)}
                className="p-2 rounded-xl bg-slate-800/50 hover:bg-blue-500/20 text-slate-400 hover:text-blue-400 transition-all duration-300 border border-slate-700/30 hover:border-blue-500/30"
                title={isXlSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              >
                <motion.div
                  animate={{ rotate: isXlSidebarOpen ? 0 : 180 }}
                  transition={{ duration: 0.3 }}
                >
                  <ChevronLeft className="w-4 h-4" />
                </motion.div>
              </motion.button>
            </div>
            
            {/* Notebook Title - Only show when sidebar is open and not in mobile view */}
            <AnimatePresence>
              {isXlSidebarOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="mb-6"
                >
                  <p className="text-xs text-slate-500 mb-2 uppercase tracking-wider">Workspace</p>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    {notebook?.description}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Mobile/Tablet Header */}
          <div className="xl:hidden">
            <motion.button
              whileHover={{ x: -4, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => window.history.back()}
              className="flex items-center text-slate-400 hover:text-blue-400 transition-all duration-300 mb-4  rounded-xl hover:bg-blue-500/10"
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back
            </motion.button>
            <h1 className="text-xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              {notebook?.title}
            </h1>
            <p className="text-sm text-slate-400 leading-relaxed mb-4">
              {notebook?.description}
            </p>
          </div>
        </div>

        {/* Documents Section */}
        <div className={`flex-1 overflow-y-auto scrollbar-hide`}>
          <div className={`transition-all duration-500 ${isXlSidebarOpen ? 'p-4 xl:px-6' : 'xl:p-2'} ${isPdfOpen ? 'hidden' : ''}`}>
            {/* Documents Header - Responsive */}
            <div className={`flex items-center mb-4 transition-all duration-300 ${
              !isXlSidebarOpen ? 'xl:flex-col xl:gap-3 xl:mb-6' : 'justify-between'
            }`}>
              <AnimatePresence>
                {(isXlSidebarOpen || window.innerWidth < 1280) && (
                  <motion.h2
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className="text-sm font-semibold text-slate-300 flex items-center"
                  >
                    <div className="p-1.5 rounded-lg bg-blue-500/10 mr-3">
                      <FileText className="w-3.5 h-3.5 text-blue-400" />
                    </div>
                    <span className="hidden xl:inline">Documents</span>
                    <span className="xl:hidden">Documents ({documents.length})</span>
                    <span className="hidden xl:inline ml-2 text-xs bg-slate-700/50 px-2 py-0.5 rounded-full text-slate-400">
                      {documents.length}
                    </span>
                  </motion.h2>
                )}
              </AnimatePresence>
              
              {/* Collapsed state icon indicator */}
              {!isXlSidebarOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="hidden xl:flex w-10 h-10 rounded-2xl bg-blue-500/10 items-center justify-center mb-2"
                >
                  <FileText className="w-5 h-5 text-blue-400" />
                </motion.div>
              )}
              
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={triggerFileUpload}
                disabled={isUploading}
                className={`rounded-2xl bg-gradient-to-r from-blue-500/10 to-cyan-500/10 hover:from-blue-500/20 hover:to-cyan-500/20 text-blue-400 hover:text-blue-300 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${
                  !isXlSidebarOpen 
                    ? 'xl:w-10 xl:h-10 xl:p-2 xl:flex xl:items-center xl:justify-center' 
                    : 'p-2'
                }`}
                title="Upload documents"
              >
                <Upload className={`${!isXlSidebarOpen ? 'xl:w-4 xl:h-4' : 'w-4 h-4'}`} />
              </motion.button>
            </div>
            
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
            
            {/* Documents List */}
            <div className="space-y-3">
              {isUploading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`w-full rounded-2xl bg-gradient-to-r from-blue-500/10 via-blue-400/5 to-cyan-500/10 backdrop-blur-sm ${
                    isXlSidebarOpen ? 'p-4' : 'xl:p-3'
                  }`}
                >
                  <div className="flex items-center">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full mr-3 flex-shrink-0"
                    />
                    <AnimatePresence>
                      {(isXlSidebarOpen || window.innerWidth < 1280) && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="min-w-0 flex-1"
                        >
                          <p className="text-sm font-medium text-blue-300">
                            Uploading documents...
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            Processing PDFs
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
              
              {documents.map((doc) => (
                <motion.button
                  key={doc.id}
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    // Only open PDF when clicking on the card, not when selecting for AI
                    if (doc.storage_path || doc.content_text) {
                      handlePdfOpen(doc);
                    }
                  }}
                  className={`w-full rounded-2xl text-left transition-all duration-300 group overflow-hidden ${
                    selectedDocuments.includes(doc.id)
                      ? 'bg-gradient-to-r from-blue-500/20 via-blue-400/10 to-cyan-500/20 shadow-lg shadow-blue-500/10'
                      : 'bg-gray-800/40 hover:bg-gray-700/60 hover:shadow-lg hover:shadow-gray-900/20'
                  } ${
                    isXlSidebarOpen ? 'p-4' : 'xl:p-2 xl:mb-3'
                  } ${
                    (!doc.storage_path && !doc.content_text) ? 'opacity-75' : ''
                  }`}
                  title={
                    !isXlSidebarOpen 
                      ? doc.filename 
                      : (!doc.storage_path && !doc.content_text) 
                        ? 'Upload incomplete - PDF not viewable' 
                        : 'Click to view PDF • Use checkbox to select for AI'
                  }
                >
                  <div className={`flex items-center ${!isXlSidebarOpen ? 'xl:justify-center' : ''}`}>
                    <div className={`rounded-2xl flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                      selectedDocuments.includes(doc.id)
                        ? 'bg-blue-500/20 text-blue-300'
                        : 'bg-gray-700/50 text-gray-400 group-hover:bg-gray-600/60 group-hover:text-gray-300'
                    } ${
                      isXlSidebarOpen ? 'w-10 h-10 mr-3' : 'xl:w-10 xl:h-10 xl:mr-0'
                    }`}>
                      <FileText className={`${isXlSidebarOpen ? 'w-4 h-4' : 'xl:w-4 xl:h-4'}`} />
                      
                      {/* Selection indicator for collapsed mode */}
                      {!isXlSidebarOpen && selectedDocuments.includes(doc.id) && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute -top-1 -right-1 w-3 h-3 bg-blue-400 rounded-full border-2 border-gray-900"
                        />
                      )}
                    </div>
                    
                    <AnimatePresence>
                      {(isXlSidebarOpen || window.innerWidth < 1280) && (
                        <motion.div
                          initial={{ opacity: 0, width: 0 }}
                          animate={{ opacity: 1, width: 'auto' }}
                          exit={{ opacity: 0, width: 0 }}
                          className="min-w-0 flex-1"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center flex-1 min-w-0">
                              {/* AI Selection Checkbox */}
                              <div 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleDocumentSelection(doc.id);
                                }}
                                className="relative mr-3 cursor-pointer"
                                title="Select for AI conversation"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedDocuments.includes(doc.id)}
                                  onChange={() => {}} // Controlled by parent div
                                  className="sr-only"
                                />
                                <div className={`w-4 h-4 rounded border-2 transition-all duration-200 flex items-center justify-center ${
                                  selectedDocuments.includes(doc.id)
                                    ? 'bg-gradient-to-r from-blue-500 to-cyan-500 border-blue-400 shadow-lg shadow-blue-500/25'
                                    : 'bg-gray-700/60 border-gray-600 hover:border-gray-500 hover:bg-gray-600/60'
                                }`}>
                                  {selectedDocuments.includes(doc.id) && (
                                    <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                  )}
                                </div>
                              </div>
                              <p className={`text-sm font-medium truncate ${
                                selectedDocuments.includes(doc.id) ? 'text-blue-200' : 'text-gray-200'
                              }`}>
                                {doc.filename}
                              </p>
                            </div>
                            {(!doc.storage_path && !doc.content_text) && (
                              <div className="ml-2 flex-shrink-0">
                                <div className="w-2 h-2 bg-red-400 rounded-full" title="Upload incomplete - PDF not viewable" />
                              </div>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-1">
                            {new Date(doc.created_at).toLocaleDateString()}
                            {doc.status && doc.status !== 'ready' && (
                              <span className="ml-2 text-amber-400">({doc.status})</span>
                            )}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.button>
              ))}
              
              {documents.length === 0 && !isUploading && (
                <AnimatePresence>
                  {(isXlSidebarOpen || window.innerWidth < 1280) && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="text-center py-8 text-slate-400"
                    >
                      <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-slate-700/30 flex items-center justify-center">
                        <FileText className="w-6 h-6 opacity-50" />
                      </div>
                      <p className="text-sm font-medium mb-1">No documents yet</p>
                      <p className="text-xs text-slate-500">Upload PDFs to get started</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>
          </div>

          {/* PDF Viewer */}
          <AnimatePresence>
            {isPdfOpen && selectedPdfDocument && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex-1 bg-white rounded-xl overflow-hidden shadow-lg border border-gray-200"
              >
                {/* PDF Header */}
                <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white truncate max-w-48">
                        {selectedPdfDocument.filename}
                      </h3>
                      <p className="text-xs text-gray-400">
                        {pdfNumPages ? `Page ${pdfPageNumber} of ${pdfNumPages}` : 'Loading...'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {/* Zoom Controls */}
                    <div className="flex items-center space-x-1 bg-gray-700/50 rounded px-2 py-1">
                      <button
                        onClick={() => setPdfZoom(prev => Math.max(0.5, prev - 0.1))}
                        className="p-1 rounded hover:bg-gray-600 text-white text-xs"
                        title="Zoom Out"
                      >
                        -
                      </button>
                      <span className="text-xs text-white min-w-[3rem] text-center">
                        {Math.round(pdfZoom * 100)}%
                      </span>
                      <button
                        onClick={() => setPdfZoom(prev => Math.min(3.0, prev + 0.1))}
                        className="p-1 rounded hover:bg-gray-600 text-white text-xs"
                        title="Zoom In"
                      >
                        +
                      </button>
                    </div>
                    
                    {/* Page Navigation */}
                    {pdfNumPages && pdfNumPages > 1 && (
                      <>
                        <button
                          onClick={() => setPdfPageNumber(prev => Math.max(1, prev - 1))}
                          disabled={pdfPageNumber <= 1}
                          className="p-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ChevronLeft className="w-3 h-3 text-white" />
                        </button>
                        <button
                          onClick={() => setPdfPageNumber(prev => Math.min(pdfNumPages, prev + 1))}
                          disabled={pdfPageNumber >= pdfNumPages}
                          className="p-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ChevronLeft className="w-3 h-3 text-white rotate-180" />
                        </button>
                      </>
                    )}
                    
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => {
                        if (pdfBlobUrl) {
                          URL.revokeObjectURL(pdfBlobUrl);
                          setPdfBlobUrl(null);
                        }
                        setIsPdfOpen(false);
                        setSelectedPdfDocument(null);
                        setPdfPageNumber(1);
                      }}
                      className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-all duration-200"
                    >
                      <X className="w-4 h-4" />
                    </motion.button>
                  </div>
                </div>

                {/* PDF Content */}
                <div className="h-[calc(100vh-200px)] overflow-auto bg-gray-900 p-3">
                  <div className="w-full max-w-full">
                    {(() => {
                      try {
                        // Check if document has storage path (new format) or content_text (legacy format)
                        const hasStoragePath = selectedPdfDocument.storage_path;
                        const hasContentText = selectedPdfDocument.content_text;
                        
                        if (!hasStoragePath && !hasContentText) {
                          throw new Error('No PDF data available');
                        }
                        
                        // For documents with storage path, use the secure API endpoint
                        let pdfSource: string;
                        if (hasStoragePath) {
                          // Use the blob URL if available
                          if (pdfBlobUrl) {
                            pdfSource = pdfBlobUrl;
                          } else {
                            throw new Error('PDF file is loading...');
                          }
                        } else {
                          // Legacy fallback for base64 content
                          const base64Data = selectedPdfDocument.content_text;
                          if (!base64Data || base64Data.trim() === '') {
                            throw new Error('No PDF data available');
                          }
                          
                          // Validate base64 data
                          if (typeof window !== 'undefined') {
                            try {
                              atob(base64Data);
                            } catch {
                              throw new Error('Invalid PDF data format');
                            }
                          }
                          pdfSource = `data:application/pdf;base64,${base64Data}`;
                        }
                        
                        return (
                          <Document
                            file={pdfSource}
                            onLoadSuccess={({ numPages }: { numPages: number }) => setPdfNumPages(numPages)}
                            onLoadError={(error) => {
                              console.error('PDF load error:', error);
                            }}
                            className="shadow-lg"
                            loading={
                              <div className="flex items-center justify-center py-16">
                                <div className="animate-spin w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full"></div>
                                <span className="ml-3 text-gray-600">Loading PDF...</span>
                              </div>
                            }
                            error={
                              <div className="flex flex-col items-center justify-center py-16 text-center">
                                <XCircle className="w-12 h-12 text-red-400 mb-4" />
                                <h3 className="text-lg font-semibold text-gray-700 mb-2">Unable to load PDF</h3>
                                <p className="text-gray-500 text-sm max-w-md">
                                  This document may not be a valid PDF file or the content is corrupted.
                                </p>
                                {hasStoragePath && (
                                  <p className="text-gray-400 text-xs mt-2">
                                    Document ID: {selectedPdfDocument.id}
                                  </p>
                                )}
                              </div>
                            }
                          >
                            <Page 
                              pageNumber={pdfPageNumber} 
                              width={400}
                              scale={pdfZoom}
                              className="w-full max-w-full mx-auto shadow-sm"
                              renderTextLayer={true}
                              renderAnnotationLayer={true}
                              loading={
                                <div className="flex items-center justify-center py-8">
                                  <div className="animate-spin w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full"></div>
                                  <span className="ml-2 text-gray-600">Loading page...</span>
                                </div>
                              }
                              error={
                                <div className="flex flex-col items-center justify-center py-8 text-center bg-red-50 rounded-lg">
                                  <XCircle className="w-8 h-8 text-red-400 mb-2" />
                                  <p className="text-red-600 text-sm">Error loading page</p>
                                </div>
                              }
                            />
                          </Document>
                        );
                      } catch (error) {
                        return (
                          <div className="flex flex-col items-center justify-center py-16 text-center">
                            <XCircle className="w-12 h-12 text-red-400 mb-4" />
                            <h3 className="text-lg font-semibold text-gray-700 mb-2">Cannot display PDF</h3>
                            <p className="text-gray-500 text-sm max-w-md mb-4">
                              {error instanceof Error ? error.message : 'Unknown error occurred'}
                            </p>
                            <div className="bg-gray-100 rounded-lg p-4 max-w-md mb-4">
                              <h4 className="font-medium text-gray-700 mb-2">Document Information:</h4>
                              <p className="text-sm text-gray-600">
                                <strong>Filename:</strong> {selectedPdfDocument.filename}
                              </p>
                              <p className="text-sm text-gray-600">
                                <strong>Storage Path:</strong> {selectedPdfDocument.storage_path || 'Not available'}
                              </p>
                              <p className="text-sm text-gray-600">
                                <strong>Status:</strong> {selectedPdfDocument.status || 'Unknown'}
                              </p>
                              <p className="text-sm text-gray-600">
                                <strong>Content Available:</strong> {selectedPdfDocument.content_text ? 'Yes (Text)' : 'No'}
                              </p>
                            </div>
                            {!selectedPdfDocument.storage_path && (
                              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 max-w-md">
                                <div className="flex items-center mb-2">
                                  <ExternalLink className="w-4 h-4 text-amber-600 mr-2" />
                                  <h5 className="font-medium text-amber-800">Incomplete Upload</h5>
                                </div>
                                <p className="text-amber-700 text-xs mb-3">
                                  This document was not fully uploaded to storage. The PDF file is not available for viewing.
                                </p>
                                <button
                                  onClick={() => {
                                    setIsPdfOpen(false);
                                    setSelectedPdfDocument(null);
                                    // Could trigger re-upload flow here
                                  }}
                                  className="text-xs bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 rounded-md transition-colors"
                                >
                                  Close and Re-upload
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      }
                    })()}
                  </div>
                </div>

              </motion.div>
            )}
          </AnimatePresence>

          {/* Chat History Section - Only show when PDF is not open */}
          <AnimatePresence>
            {!isPdfOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className={`mt-6 transition-all duration-500 ${isXlSidebarOpen ? 'p-4 xl:px-6' : 'xl:p-2'}`}
              >
                <div className={`flex items-center mb-4 transition-all duration-300 ${
                  !isXlSidebarOpen ? 'xl:flex-col xl:gap-3 xl:mb-6' : 'justify-between'
                }`}>
              <AnimatePresence>
                {(isXlSidebarOpen || window.innerWidth < 1280) && (
                  <motion.h2
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className="text-sm font-semibold text-slate-300 flex items-center"
                  >
                    <div className="p-1.5 rounded-lg bg-purple-500/10 mr-3">
                      <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
                    </div>
                    <span className="hidden xl:inline">Chat History</span>
                    <span className="xl:hidden">Chats</span>
                  </motion.h2>
                )}
              </AnimatePresence>
              
              {/* Collapsed state icon indicator */}
              {!isXlSidebarOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="hidden xl:flex w-10 h-10 rounded-2xl bg-purple-500/10 items-center justify-center mb-2"
                >
                  <MessageSquare className="w-5 h-5 text-purple-400" />
                </motion.div>
              )}
              
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={createNewChat}
                className={`rounded-2xl bg-gradient-to-r from-green-500/10 to-blue-500/10 hover:from-green-500/20 hover:to-blue-500/20 text-green-400 hover:text-green-300 transition-all duration-300 ${
                  !isXlSidebarOpen 
                    ? 'xl:w-10 xl:h-10 xl:p-2 xl:flex xl:items-center xl:justify-center' 
                    : 'p-2'
                }`}
                title="New chat"
              >
                <Plus className={`${!isXlSidebarOpen ? 'xl:w-4 xl:h-4' : 'w-4 h-4'}`} />
              </motion.button>
            </div>
            
            <div className="space-y-3">
              {chatSessions.map((chat) => (
                <motion.button
                  key={chat.id}
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => switchChat(chat.id)}
                  className={`w-full rounded-2xl text-left transition-all duration-300 group overflow-hidden ${
                    currentChatId === chat.id
                      ? 'bg-gradient-to-r from-purple-500/20 via-purple-400/10 to-blue-500/20 shadow-lg shadow-purple-500/10'
                      : 'bg-slate-800/40 hover:bg-slate-700/60 hover:shadow-lg hover:shadow-slate-900/20'
                  } ${
                    isXlSidebarOpen ? 'p-4' : 'xl:p-2 xl:mb-3'
                  }`}
                  title={!isXlSidebarOpen ? chat.title : undefined}
                >
                  <div className={`flex items-center ${!isXlSidebarOpen ? 'xl:justify-center' : ''}`}>
                    <div className={`rounded-2xl flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                      currentChatId === chat.id
                        ? 'bg-purple-500/20 text-purple-300'
                        : 'bg-slate-700/50 text-slate-400 group-hover:bg-slate-600/60 group-hover:text-slate-300'
                    } ${
                      isXlSidebarOpen ? 'w-10 h-10 mr-3' : 'xl:w-10 xl:h-10 xl:mr-0'
                    }`}>
                      <MessageSquare className={`${isXlSidebarOpen ? 'w-4 h-4' : 'xl:w-4 xl:h-4'}`} />
                      
                      {/* Active indicator for collapsed mode */}
                      {!isXlSidebarOpen && currentChatId === chat.id && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute -top-1 -right-1 w-3 h-3 bg-purple-400 rounded-full border-2 border-slate-900"
                        />
                      )}
                    </div>
                    
                    <AnimatePresence>
                      {(isXlSidebarOpen || window.innerWidth < 1280) && (
                        <motion.div
                          initial={{ opacity: 0, width: 0 }}
                          animate={{ opacity: 1, width: 'auto' }}
                          exit={{ opacity: 0, width: 0 }}
                          className="min-w-0 flex-1"
                        >
                          <p className={`text-sm font-medium truncate ${
                            currentChatId === chat.id ? 'text-purple-200' : 'text-slate-200'
                          }`}>
                            {chat.title}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            {new Date(chat.created_at).toLocaleDateString()}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.button>
              ))}
            </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className={`flex-1 xl:flex-1 flex flex-col xl:h-full bg-gradient-to-br from-slate-950/30 via-gray-950 to-slate-950/20 relative min-h-0 ${
        responsiveActiveTab === 'chat' ? 'flex' : 'hidden xl:flex'
      }`}>
        {/* Enhanced Chat Header */}
        <div className="bg-gradient-to-r from-gray-900/90 via-slate-900/95 to-gray-900/90 backdrop-blur-xl px-6 py-5 shadow-2xl shadow-gray-900/20">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-blue-200 via-white to-cyan-200 bg-clip-text text-transparent">
                {notebook?.title}
              </h1>
              <p className="text-sm text-blue-300/80 mt-1 flex items-center">
                <MessageSquare className="w-4 h-4 mr-1" />
                {documents.length} document{documents.length !== 1 ? 's' : ''} • AI Conversation
              </p>
            </div>
            
          </div>
        </div>

        {/* Enhanced Chat Messages Area */}
        <div className="flex-1 overflow-y-auto scrollbar-hide p-6 pb-32 space-y-6 bg-gradient-to-b from-slate-950/10 via-transparent to-gray-950/10">
          <AnimatePresence>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-3xl p-5 rounded-2xl shadow-xl ${
                  message.role === 'user' 
                    ? 'bg-gradient-to-r from-blue-600 via-blue-700 to-cyan-600 text-white shadow-blue-500/30 backdrop-blur-sm' 
                    : 'bg-gradient-to-br from-gray-800/95 to-slate-900/20 text-gray-100 backdrop-blur-sm shadow-gray-900/20 border border-blue-500/10'
                }`}>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed font-medium tracking-wide">
                    {message.content}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {isSending && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="bg-gradient-to-br from-gray-800/95 to-slate-900/20 text-gray-100 max-w-3xl p-5 rounded-2xl backdrop-blur-sm shadow-gray-900/20 border border-blue-500/10">
                <div className="flex items-center space-x-2">
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="w-2 h-2 bg-blue-400 rounded-full"
                  />
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                    className="w-2 h-2 bg-blue-400 rounded-full"
                  />
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                    className="w-2 h-2 bg-blue-400 rounded-full"
                  />
                  <span className="ml-2 text-sm text-blue-300">AI is thinking...</span>
                </div>
              </div>
            </motion.div>
          )}
          
          {/* Invisible element to scroll to */}
          <div ref={messagesEndRef} />
        </div>

              {/* Input Area */}
              <div className="absolute bottom-6 left-6 right-6 pointer-events-none">
                <div className="max-w-3xl mx-auto pointer-events-auto">
                  {selectedDocuments.length > 0 && messages.length === 0 && (
                    <div className="mb-6">
                      <p className="text-sm text-slate-800 mb-3 text-center">Try asking:</p>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {[
                          "Explain the main concepts in simple terms",
                          "What are the key takeaways?",
                          "Break down the most important points",
                          "Can you give me a summary for studying?",
                          "What should I focus on learning here?"
                        ].map((suggestion, index) => (
                          <button
                            key={index}
                            onClick={() => setNewMessage(suggestion)}
                            className="px-3 py-1 text-xs bg-slate-800 text-slate-300 rounded-full hover:bg-slate-700 transition-colors"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-center space-x-3 bg-gradient-to-r from-gray-900/80 via-slate-900/90 to-gray-900/80 backdrop-blur-xl border border-blue-500/20 rounded-2xl p-3 shadow-2xl shadow-gray-900/20">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                      placeholder="Ask a question about your documents..."
                      className="flex-1 px-5 py-4 bg-transparent text-white placeholder-blue-300/60 focus:outline-none text-base font-medium tracking-wide leading-relaxed"
                      disabled={isSending}
                    />
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={sendMessage}
                      disabled={!newMessage.trim() || isSending}
                      className="p-3 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-xl hover:shadow-lg hover:shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center transition-all duration-200"
                    >
                      <Send className="w-4 h-4" />
                    </motion.button>
                  </div>
                </div>
                {selectedDocuments.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2 justify-center">
                    {selectedDocuments.map((docId) => {
                      const doc = documents.find(d => d.id === docId);
                      return doc ? (
                        <span
                          key={docId}
                          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-400/30"
                        >
                          <FileText className="w-3 h-3 mr-1" />
                          {doc.filename}
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
        </div>
      </div>

      {/* Right Sidebar - AI Studio */}
      <div className={`w-full xl:w-80 xl:flex-shrink-0 bg-gradient-to-br from-slate-950/98 via-slate-900/95 to-slate-950/98 backdrop-blur-xl flex flex-col xl:h-full min-h-0 ${
        responsiveActiveTab === 'studio' ? 'flex' : 'hidden xl:flex'
      }`}>
        {/* Enhanced Studio Header */}
        <div className="p-4 xl:p-6">
          {/* XL Screen Header */}
          <div className="hidden xl:block">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-1">
                  AI Studio
                </h3>
                <p className="text-xs text-slate-400">Smart learning tools</p>
              </div>
            </div>
          </div>

          {/* Mobile/Tablet Header */}
          <div className="xl:hidden">
            <h3 className="text-xl font-bold mb-2 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              AI Studio
            </h3>
            <p className="text-sm text-slate-400 leading-relaxed mb-4">
              Interactive learning tools for your documents
            </p>
          </div>
          
          {/* Tab Navigation */}
          <div className="flex gap-1 p-1 bg-slate-800/30 rounded-2xl backdrop-blur-sm">
            <TabButton 
              icon={BookOpen} 
              label="Quiz" 
              active={activeTab === 'quiz'} 
              onClick={() => setActiveTab('quiz')}
            />
            <TabButton 
              icon={BarChart3} 
              label="Analytics" 
              active={activeTab === 'progress'} 
              onClick={() => setActiveTab('progress')}
            />
            <TabButton 
              icon={Play} 
              label="Videos" 
              active={activeTab === 'videos'} 
              onClick={() => setActiveTab('videos')}
            />
          </div>
          
          {/* Status Indicator */}
          <div className="mt-6 flex items-center justify-center">
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/40 rounded-2xl">
              <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                selectedDocuments.length > 0 ? 'bg-green-400 animate-pulse shadow-lg shadow-green-400/20' : 'bg-slate-500'
              }`} />
              <span className="text-xs text-slate-300 font-medium">
                {selectedDocuments.length > 0 
                  ? `${selectedDocuments.length} document${selectedDocuments.length > 1 ? 's' : ''} selected`
                  : 'No documents selected'
                }
              </span>
            </div>
          </div>
        </div>
        
        {/* Tab Content Section */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          <div className="p-4 xl:px-6">

          {activeTab === 'quiz' && (
            <div className="space-y-4">
              {/* Quiz Type Selection Header */}
              <div className="flex items-center mb-4">
                <div className="p-1.5 rounded-lg bg-blue-500/10 mr-3">
                  <BookOpen className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-300">Quiz Generator</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Choose your question format</p>
                </div>
              </div>

              {/* Quiz Type Selection Cards */}
              <div className="bg-slate-800/40 rounded-2xl p-4">
                
                <div className="grid grid-cols-3 gap-3">
                  {([
                    { type: 'MCQ', label: 'Multiple Choice', icon: '🎯' },
                    { type: 'SAQ', label: 'Short Answer', icon: '✏️' },
                    { type: 'LAQ', label: 'Long Answer', icon: '📝' }
                  ] as const).map(({ type, icon }) => (
                    <motion.button
                      key={type}
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedQuizType(type)}
                      className={`p-3 rounded-2xl text-center transition-all duration-300 group overflow-hidden ${
                        selectedQuizType === type
                          ? 'bg-gradient-to-r from-blue-500/20 via-blue-400/10 to-purple-500/20 shadow-lg shadow-blue-500/10'
                          : 'bg-slate-700/40 hover:bg-slate-600/60 hover:shadow-lg hover:shadow-slate-900/20'
                      }`}
                    >
                      <div className="text-lg mb-1">{icon}</div>
                      <div className={`text-xs font-medium ${
                        selectedQuizType === type ? 'text-blue-200' : 'text-slate-300 group-hover:text-slate-200'
                      }`}>
                        {type}
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Modern Generate Quiz Button */}
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="relative"
              >
                <motion.button
                  onClick={() => generateQuizWithType(selectedQuizType)}
                  disabled={selectedDocuments.length === 0 || isGeneratingQuiz}
                  className={`w-full relative overflow-hidden px-6 py-3.5 rounded-xl font-medium text-sm transition-all duration-500 flex items-center justify-center gap-3 ${
                    selectedDocuments.length === 0 || isGeneratingQuiz
                      ? 'bg-slate-700/50 text-slate-400 cursor-not-allowed border border-slate-600/50'
                      : 'bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 text-white hover:shadow-xl hover:shadow-blue-500/30 border-0 group'
                  }`}
                >
                  {/* Animated background gradient */}
                  {selectedDocuments.length > 0 && !isGeneratingQuiz && (
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-blue-700 via-indigo-600 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                      initial={false}
                    />
                  )}
                  
                  {/* Button content */}
                  <div className="relative z-10 flex items-center gap-3">
                    {isGeneratingQuiz ? (
                      <>
                        <motion.div
                          animate={{ 
                            rotate: 360,
                            scale: [1, 1.1, 1]
                          }}
                          transition={{ 
                            rotate: { duration: 2, repeat: Infinity, ease: "linear" },
                            scale: { duration: 1, repeat: Infinity, ease: "easeInOut" }
                          }}
                          className="relative"
                        >
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full" />
                        </motion.div>
                        <span className="font-medium">Generating Quiz...</span>
                        <motion.div
                          animate={{ opacity: [0.5, 1, 0.5] }}
                          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                          className="flex gap-1"
                        >
                          <div className="w-1 h-1 bg-white/60 rounded-full" />
                          <div className="w-1 h-1 bg-white/60 rounded-full" />
                          <div className="w-1 h-1 bg-white/60 rounded-full" />
                        </motion.div>
                      </>
                    ) : (
                      <>
                        <motion.div
                          whileHover={{ rotate: 10, scale: 1.1 }}
                          transition={{ type: "spring", stiffness: 400, damping: 10 }}
                        >
                          <BookOpen className="w-5 h-5" />
                        </motion.div>
                        <span className="font-medium">Generate {selectedQuizType} Quiz</span>
                        <motion.div
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="text-xs bg-white/20 px-2.5 py-0.5 rounded-full font-medium"
                        >
                          5Q
                        </motion.div>
                      </>
                    )}
                  </div>
                  
                  {/* Shimmer effect */}
                  {selectedDocuments.length > 0 && !isGeneratingQuiz && (
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                      initial={{ x: '-100%' }}
                      whileHover={{ x: '100%' }}
                      transition={{ duration: 0.8, ease: "easeInOut" }}
                    />
                  )}
                </motion.button>
              </motion.div>
              
              {/* Help Text */}
              {selectedDocuments.length === 0 && (
                <div className="text-center p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <div className="text-amber-400 text-xs font-medium mb-1">⚠️ No Documents Selected</div>
                  <div className="text-amber-300/80 text-xs">
                    Please select documents from the sidebar to generate quiz questions
                  </div>
                </div>
              )}

              {selectedDocuments.length === 0 && (
                <p className="text-xs text-slate-400 text-center">
                  Select documents to generate quiz
                </p>
              )}

              {/* Enhanced Quiz Questions Display */}
              {quizQuestions.length > 0 && (
                <div className="bg-gradient-to-br from-slate-800/60 to-slate-900/60 rounded-2xl p-5 border border-slate-700/30">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-r from-green-500 to-blue-500 flex items-center justify-center">
                        <span className="text-white text-xs font-bold">{quizQuestions.length}</span>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-white">Quiz Questions</h4>
                        <p className="text-xs text-slate-400">{selectedQuizType} format</p>
                      </div>
                    </div>
                    {showResults && (
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-700/50 rounded-full">
                        <div className="text-xs font-medium text-white">
                          Score: {Object.values(quizResults || {}).filter(r => r.isCorrect).length}/{quizQuestions.length}
                        </div>
                        <div className={`w-2 h-2 rounded-full ${
                          Object.values(quizResults || {}).filter(r => r.isCorrect).length === quizQuestions.length 
                            ? 'bg-green-400' : 'bg-yellow-400'
                        }`} />
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-3 max-h-80 overflow-y-auto scrollbar-hide">
                  {quizQuestions.slice(0, 5).map((question, index) => (
                    <div
                      key={question.id}
                      className="p-3 bg-slate-800 rounded-lg border border-slate-600"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <p className="text-sm font-medium text-white flex-1">
                          Q{index + 1}: {question.question}
                        </p>
                        {showResults && quizResults && quizResults[question.id] && (
                          <div className="ml-2 flex-shrink-0">
                            {quizResults[question.id].isCorrect ? (
                              <CheckCircle className="w-4 h-4 text-green-400" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-400" />
                            )}
                          </div>
                        )}
                      </div>
                      
                      {question.type === 'mcq' && question.options && (
                        <div className="space-y-1">
                          {question.options.map((option, optIndex) => {
                            const isSelected = userAnswers[question.id] === option;
                            const isCorrect = question.correct_answer === option;
                            const showResult = showResults && quizResults;
                            
                            let buttonClass = 'w-full text-left text-xs p-2 rounded transition-colors ';
                            
                            if (showResult) {
                              if (isCorrect) {
                                buttonClass += 'bg-green-600 text-white ';
                              } else if (isSelected && !isCorrect) {
                                buttonClass += 'bg-red-600 text-white ';
                              } else {
                                buttonClass += 'bg-slate-700 text-slate-300 ';
                              }
                            } else {
                              buttonClass += isSelected
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-700 text-slate-300 hover:bg-slate-600';
                            }
                            
                            return (
                              <button
                                key={optIndex}
                                onClick={() => !showResults && handleAnswer(question.id, option)}
                                disabled={showResults}
                                className={buttonClass}
                              >
                                {String.fromCharCode(65 + optIndex)}. {option}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      
                      {(question.type === 'saq' || question.type === 'laq') && (
                        <div className="space-y-2">
                          <textarea
                            placeholder="Your answer..."
                            value={userAnswers[question.id] || ''}
                            onChange={(e) => handleAnswer(question.id, e.target.value)}
                            disabled={showResults}
                            className={`w-full p-2 border rounded text-xs ${
                              showResults
                                ? 'bg-slate-700 border-slate-600 text-slate-300 cursor-not-allowed'
                                : 'bg-slate-700 border-slate-600 text-white placeholder-slate-400'
                            }`}
                            rows={question.type === 'laq' ? 4 : 2}
                          />
                          {showResults && quizResults && quizResults[question.id] && (
                            <div className="text-xs">
                              <div className="font-medium text-green-400 mb-1">Correct Answer:</div>
                              <div className="text-slate-300 bg-slate-700 p-2 rounded border">
                                {question.correct_answer}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {showResults && quizResults && quizResults[question.id] && (
                        <div className="mt-3 p-2 bg-slate-700 rounded border border-slate-600">
                          <div className="text-xs font-medium text-blue-400 mb-1">Explanation:</div>
                          <div className="text-xs text-slate-300">
                            {quizResults[question.id].explanation}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {/* Submit Button */}
                  {!showResults && Object.keys(userAnswers).length > 0 && (
                    <div className="mt-4 flex justify-center">
                      <button
                        onClick={submitQuiz}
                        disabled={isSubmittingQuiz}
                        className={`px-6 py-2 rounded-lg font-medium text-sm transition-colors ${
                          isSubmittingQuiz
                            ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                      >
                        {isSubmittingQuiz ? 'Submitting...' : 'Submit Quiz'}
                      </button>
                    </div>
                  )}
                  
                  {/* Results Summary */}
                  {showResults && quizResults && (
                    <div className="mt-4 p-4 bg-slate-800 rounded-lg border border-slate-600">
                      <h4 className="text-sm font-medium text-white mb-2">Quiz Results</h4>
                      <div className="text-xs text-slate-300">
                        Score: {Object.values(quizResults).filter(r => r.isCorrect).length} / {Object.keys(quizResults).length}
                      </div>
                    </div>
                  )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'progress' && (
            <div className="space-y-4">
              {/* Progress Header */}
              <div className="flex items-center mb-4">
                <div className="p-1.5 rounded-lg bg-green-500/10 mr-3">
                  <BarChart3 className="w-3.5 h-3.5 text-green-400" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-300">Progress Analytics</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Track your learning journey</p>
                </div>
              </div>

              {isLoadingProgress ? (
                <div className="text-center py-8">
                  <div className="animate-spin w-8 h-8 border-2 border-green-400 border-t-transparent rounded-full mx-auto mb-2"></div>
                  <p className="text-sm text-slate-400">Loading progress...</p>
                </div>
              ) : (
                <>
                  {/* Statistics Grid */}
                  <div className="space-y-3">
                    <div className="bg-slate-800/40 rounded-2xl p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-medium text-slate-200 mb-1">Average Score</h4>
                          <p className="text-2xl font-bold text-blue-400">
                            {progressData?.statistics?.averageScore || 0}%
                          </p>
                        </div>
                        <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                          <BarChart3 className="w-5 h-5 text-blue-400" />
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 mt-2">
                        {progressData?.statistics?.totalAttempts || 0} quiz attempts
                      </p>
                    </div>
                    
                    <div className="bg-slate-800/40 rounded-2xl p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-medium text-slate-200 mb-1">Chat Activity</h4>
                          <p className="text-2xl font-bold text-green-400">{messages.length}</p>
                        </div>
                        <div className="w-10 h-10 rounded-2xl bg-green-500/10 flex items-center justify-center">
                          <MessageSquare className="w-5 h-5 text-green-400" />
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 mt-2">Messages exchanged</p>
                    </div>
                    
                    <div className="bg-slate-800/40 rounded-2xl p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-medium text-slate-200 mb-1">Accuracy</h4>
                          <p className="text-2xl font-bold text-purple-400">
                            {progressData?.statistics?.totalCorrectAnswers || 0}/{progressData?.statistics?.totalQuestions || 0}
                          </p>
                        </div>
                        <div className="w-10 h-10 rounded-2xl bg-purple-500/10 flex items-center justify-center">
                          <FileText className="w-5 h-5 text-purple-400" />
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 mt-2">Correct answers</p>
                    </div>
                  </div>

                  {/* Quiz Type Breakdown */}
                  {progressData?.statistics?.quizTypeBreakdown && Object.keys(progressData.statistics.quizTypeBreakdown).length > 0 && (
                    <div className="bg-slate-800/40 rounded-2xl p-4">
                      <h4 className="text-sm font-medium text-slate-200 mb-3">Quiz Types</h4>
                      <div className="space-y-3">
                        {Object.entries(progressData.statistics.quizTypeBreakdown).map(([type, count]) => (
                          <div key={type} className="flex justify-between items-center p-2 bg-slate-700/40 rounded-xl">
                            <span className="text-xs text-slate-300 capitalize">
                              {type === 'mcq' ? 'Multiple Choice' : type === 'saq' ? 'Short Answer' : 'Long Answer'}
                            </span>
                            <span className="text-xs font-medium text-white bg-slate-600/50 px-2 py-1 rounded-full">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recent Activity */}
                  {progressData?.attempts && progressData.attempts.length > 0 && (
                    <div className="bg-slate-800/40 rounded-2xl p-4">
                      <h4 className="text-sm font-medium text-slate-200 mb-3">Recent Quiz Attempts</h4>
                      <div className="space-y-3 max-h-60 overflow-y-auto">
                        {progressData.attempts.slice(0, 10).map((attempt) => (
                          <div key={attempt.id} className="flex justify-between items-center p-3 bg-slate-700/40 rounded-xl hover:bg-slate-600/40 transition-colors duration-200">
                            <div>
                              <p className="text-xs font-medium text-white">{attempt.quiz_topic}</p>
                              <p className="text-xs text-slate-400">
                                {new Date(attempt.created_at).toLocaleDateString()} • {attempt.quiz_type.toUpperCase()}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-medium text-white">{attempt.score}%</p>
                              <p className="text-xs text-slate-400">
                                {attempt.correct_answers}/{attempt.total_questions}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* No data message */}
                  {(!progressData || progressData.attempts.length === 0) && (
                    <div className="text-center py-8">
                      <BarChart3 className="w-12 h-12 text-slate-400 mb-4 mx-auto" />
                      <h4 className="text-lg font-semibold text-white mb-2">No Quiz History</h4>
                      <p className="text-sm text-slate-400 mb-4">
                        Complete some quizzes to see your progress here.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'videos' && (
            <div className="space-y-4">
              {/* Videos Header */}
              <div className="flex items-center mb-4">
                <div className="p-1.5 rounded-lg bg-red-500/10 mr-3">
                  <Play className="w-3.5 h-3.5 text-red-400" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-300">Video Recommendations</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Find relevant YouTube content</p>
                </div>
              </div>

              {/* Topic Input Section */}
              <div className="bg-slate-800/40 rounded-2xl p-4">
                <div className="space-y-3">
                  <input
                    type="text"
                    value={videoTopic}
                    onChange={(e) => setVideoTopic(e.target.value)}
                    placeholder={selectedDocuments.length > 0 ? "Using selected document (add custom topic)" : "Enter a topic (e.g., Machine Learning, Physics)"}
                    className="w-full p-3 bg-slate-700/50 rounded-xl text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 transition-all duration-200"
                  />
                  <button
                    onClick={() => loadVideoRecommendations()}
                    disabled={(!videoTopic.trim() && selectedDocuments.length === 0) || isLoadingVideos}
                    className={`w-full py-2 px-4 rounded text-sm font-medium transition-colors ${
                      (!videoTopic.trim() && selectedDocuments.length === 0) || isLoadingVideos
                        ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {isLoadingVideos ? (
                      <div className="flex items-center justify-center">
                        <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                        Generating...
                      </div>
                    ) : (
                      'Get Video Recommendations'
                    )}
                  </button>
                </div>
                
                {/* Help text */}
                <div className="mt-3 p-3 bg-slate-700 rounded border border-slate-600">
                  <p className="text-xs text-slate-400">
                    {selectedDocuments.length > 0 ? (
                      <>
                        📄 <strong>Using document:</strong> {documents.find(d => d.id === selectedDocuments[0])?.filename || 'Selected document'}
                        <br />
                        💡 The AI will analyze your document content to suggest relevant YouTube videos. You can also add a custom topic above.
                      </>
                    ) : (
                      <>
                        ⚠️ <strong>No document selected.</strong> Please select a document from the sidebar, or enter a custom topic above.
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Video Recommendations List */}
              {videoRecommendations.length > 0 && (
                <div className="bg-slate-800 border border-slate-600 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-white mb-3 flex items-center">
                    <Play className="w-4 h-4 mr-2 text-red-400" />
                    YouTube Recommendations
                  </h4>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {videoRecommendations.map((video, index) => (
                      <div
                        key={index}
                        className="p-3 bg-slate-700 rounded-lg border border-slate-600 hover:bg-slate-600 transition-colors"
                      >
                        <h5 className="text-sm font-medium text-white mb-2 line-clamp-2">
                          {video.title}
                        </h5>
                        <a
                          href={`https://www.youtube.com/results?search_query=${encodeURIComponent(video.search_query)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded-full transition-colors"
                        >
                          <Play className="w-3 h-3 mr-1" />
                          Search on YouTube
                        </a>
                        <p className="text-xs text-slate-400 mt-2">
                          Search: &ldquo;{video.search_query}&rdquo;
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No recommendations message */}
              {!isLoadingVideos && videoRecommendations.length === 0 && (
                <div className="text-center py-8">
                  <Play className="w-12 h-12 text-slate-400 mb-4 mx-auto" />
                  <h4 className="text-lg font-semibold text-white mb-2">Video Recommendations</h4>
                  <p className="text-sm text-slate-400 mb-4">
                    Enter a topic above to get personalized YouTube video recommendations.
                  </p>
                </div>
              )}

              {/* Tips Section */}
              <div className="bg-slate-800 border border-slate-600 rounded-lg p-4">
                <h4 className="text-sm font-medium text-white mb-3">Tips</h4>
                <div className="space-y-2">
                  <div className="flex items-center p-2 bg-slate-700 rounded">
                    <Play className="w-4 h-4 text-blue-400 mr-2" />
                    <span className="text-xs text-slate-300">Be specific with your topic</span>
                  </div>
                  <div className="flex items-center p-2 bg-slate-700 rounded">
                    <Clock className="w-4 h-4 text-green-400 mr-2" />
                    <span className="text-xs text-slate-300">Recommendations based on your documents</span>
                  </div>
                  <div className="flex items-center p-2 bg-slate-700 rounded">
                    <BarChart3 className="w-4 h-4 text-purple-400 mr-2" />
                    <span className="text-xs text-slate-300">Links open in new tab</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}