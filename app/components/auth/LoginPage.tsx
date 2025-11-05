'use client';

import { motion } from 'framer-motion';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/app/lib/supabase';
import { Brain } from 'lucide-react';
import { useEffect, useState } from 'react';

export function LoginPage() {
  // Handle the redirectTo safely with window object
  const [redirectUrl, setRedirectUrl] = useState<string | undefined>(undefined);
  
  useEffect(() => {
    // Set redirectUrl after component mounts to avoid SSR issues
    setRedirectUrl(`${window.location.origin}/dashboard`);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20">
          {/* Logo and branding */}
          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              className="inline-flex items-center justify-center w-16 h-16 bg-purple-600 rounded-2xl mb-4"
            >
              <Brain className="w-8 h-8 text-white" />
            </motion.div>
            <h1 className="text-3xl font-bold text-white mb-2">NotebookLM</h1>
            <p className="text-gray-300">Your AI-powered notebook companion</p>
          </div>

          {/* Auth component */}
          <div className="auth-container">
            {redirectUrl && (
              <Auth
                supabaseClient={supabase}
                appearance={{
                  theme: ThemeSupa,
                  variables: {
                    default: {
                      colors: {
                        brand: '#7c3aed',
                        brandAccent: '#6d28d9',
                      },
                    },
                  },
                  className: {
                    container: 'auth-container',
                    button: 'auth-button',
                    input: 'auth-input',
                  },
                }}
                providers={['google', 'github']}
                redirectTo={redirectUrl}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-gray-400 text-sm">
          <p>Upload PDFs, chat with AI, generate quizzes and more.</p>
        </div>
      </motion.div>

      <style jsx global>{`
        .auth-container {
          --default-font-family: 'Inter', sans-serif;
        }
        
        .auth-button {
          border-radius: 12px !important;
          font-weight: 500 !important;
          transition: all 0.2s ease !important;
        }
        
        .auth-input {
          border-radius: 8px !important;
          background: rgba(255, 255, 255, 0.1) !important;
          border: 1px solid rgba(255, 255, 255, 0.2) !important;
          color: white !important;
        }
        
        .auth-input::placeholder {
          color: rgba(255, 255, 255, 0.6) !important;
        }
        
        .auth-input:focus {
          border-color: #7c3aed !important;
          box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1) !important;
        }
      `}</style>
    </div>
  );
}