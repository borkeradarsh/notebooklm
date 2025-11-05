'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { 
  Plus, 
  FileText,
  Globe,
  TrendingUp
} from 'lucide-react';
import { useAuth } from '@/app/components/auth/AuthProvider';
import { supabase } from '@/app/lib/supabase';
import { getCurrentProfile, Profile } from '@/app/lib/profiles';
import { Button } from '@/app/components/ui/button';

interface Notebook {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  source_count: number;
  created_at: string;
  is_featured: boolean;
}

export default function DashboardPage() {
  const { user, signOut, loading } = useAuth();
  const router = useRouter();

  const [recentNotebooks, setRecentNotebooks] = useState<Notebook[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  // Auto-seeding function for new users
  const performAutoSeeding = useCallback(async () => {
    if (!user) return;

    try {
      setIsSeeding(true);
      console.log('🌱 Starting automatic seeding for new user...');

      // Get current session for auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('No session found for auto-seeding');
        return;
      }

      // Call the seeding API
      const response = await fetch('/api/seed', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();

      if (result.success) {
        console.log(`✅ Auto-seeding successful: ${result.documentsCreated} documents created`);
        
        // Refresh notebooks to show the new seeded content
        setTimeout(async () => {
          try {
            const { data } = await supabase
              .from('notebooks')
              .select('*')
              .eq('user_id', user.id)
              .order('created_at', { ascending: false });
            
            setRecentNotebooks(data || []);
          } catch (error) {
            console.error('Error refreshing notebooks after seeding:', error);
          }
        }, 1000);
      } else {
        console.error('Auto-seeding failed:', result.error);
        // Set empty state if seeding fails
        setRecentNotebooks([]);
      }
    } catch (error) {
      console.error('Error during auto-seeding:', error);
      setRecentNotebooks([]);
    } finally {
      setIsSeeding(false);
    }
  }, [user]);

  const fetchNotebooks = useCallback(async () => {
    if (!user) return;

    try {
      setDashboardLoading(true);
      
      // Fetch notebooks from database
      const { data, error } = await supabase
        .from('notebooks')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const allNotebooks = data || [];
      
      // Check if this is a new user with no notebooks - trigger auto-seeding
      if (allNotebooks.length === 0) {
        console.log('New user detected - starting automatic seeding...');
        await performAutoSeeding();
      } else {
        setRecentNotebooks(allNotebooks);
        console.log(`📚 Loaded ${allNotebooks.length} notebooks`);
      }
      
    } catch (error) {
      console.error('Error fetching notebooks:', error);
      // Show empty state on error
      setRecentNotebooks([]);
    } finally {
      setDashboardLoading(false);
    }
  }, [user, performAutoSeeding]);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    
    try {
      const userProfile = await getCurrentProfile();
      setProfile(userProfile);
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  }, [user]);

  useEffect(() => {
    fetchNotebooks();
    loadProfile();
  }, [fetchNotebooks, loadProfile]);

  const createNotebook = async () => {
    // Navigate to create new notebook page
    router.push('/notebook/new');
  };

  const openNotebook = (notebookId: string) => {
    // Navigate to existing notebook
    router.push(`/notebook/${notebookId}`);
  };



  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      day: 'numeric',
      month: 'short', 
      year: 'numeric' 
    });
  };

  const NotebookCard = ({ notebook }: { notebook: Notebook }) => (
    <motion.div
      whileHover={{ y: -4, scale: 1.02 }}
      transition={{ duration: 0.2 }}
      onClick={() => openNotebook(notebook.id)}
      className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 cursor-pointer border border-slate-700/50 hover:border-slate-600/50 shadow-lg hover:shadow-xl relative overflow-hidden group h-56"
    >
      {/* Background decoration */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 to-purple-600/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      {/* Multiple document stack visual */}
      <div className="absolute top-4 right-4">
        <div className="relative">
          <div className="w-8 h-8 bg-blue-600/80 rounded-lg flex items-center justify-center transform rotate-3">
            <FileText className="w-4 h-4 text-white" />
          </div>
          <div className="absolute -top-1 -right-1 w-8 h-8 bg-purple-600/80 rounded-lg flex items-center justify-center transform -rotate-3">
            <FileText className="w-4 h-4 text-white" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col">
        <div className="flex-1">
          <h3 className="text-white font-semibold text-xl mb-3 line-clamp-2 leading-tight">
            {notebook.title}
          </h3>
          {notebook.description && (
            <p className="text-gray-300 text-sm line-clamp-3 mb-4 leading-relaxed">
              {notebook.description}
            </p>
          )}
          
          {/* PDF Collection badges */}
          <div className="flex flex-wrap gap-1 mb-4">
            <span className="px-2 py-1 bg-blue-600/20 text-blue-300 text-xs rounded-full border border-blue-600/30">
              Chapters 1-7
            </span>
            <span className="px-2 py-1 bg-purple-600/20 text-purple-300 text-xs rounded-full border border-purple-600/30">
              Problems
            </span>
            <span className="px-2 py-1 bg-green-600/20 text-green-300 text-xs rounded-full border border-green-600/30">
              Answers
            </span>
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-gray-400 text-xs font-medium">
            {formatDate(notebook.created_at)} • {notebook.source_count} PDFs
          </span>
          <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:bg-white/20">
            <Globe className="w-4 h-4 text-white" />
          </div>
        </div>
      </div>
    </motion.div>
  );

  if (loading || dashboardLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-xl font-bold text-white">NotebookLM</h1>
            </div>

            {/* Right side */}
            <div className="flex items-center space-x-4">
              {/* View toggle */}

              {/* Create button */}
              <Button 
                onClick={createNotebook}
                className="bg-white text-slate-950 hover:bg-gray-100 font-medium"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create new
              </Button>

              {/* User menu */}
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-3 text-gray-400">
                  {/* User Info */}
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center text-white font-semibold text-sm overflow-hidden">
                      {profile?.avatar_url ? (
                        <Image 
                          src={profile.avatar_url} 
                          alt="Profile" 
                          width={32}
                          height={32}
                          className="w-full h-full object-cover rounded-full"
                        />
                      ) : (
                        (profile?.username?.[0] || user?.email?.[0])?.toUpperCase() || 'U'
                      )}
                    </div>
                    <span className="text-sm text-gray-300 hidden sm:block">
                      {profile?.username || user?.email?.split('@')[0] || 'User'}
                    </span>
                  </div>
                  
                  {/* Sign Out Button */}
                  <Button
                    onClick={signOut}
                    variant="outline"
                    size="sm"
                    className="bg-transparent border-red-500/50 text-red-400 hover:bg-red-500/10 hover:border-red-400 hover:text-red-300 transition-all duration-200"
                  >
                    Sign Out
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Recent notebooks section */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">Recent notebooks</h2>
          </div>

          {dashboardLoading ? (
            isSeeding ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                  <FileText className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-white font-medium mb-2">Welcome to NotebookLM! 🎉</h3>
                <p className="text-gray-400 text-sm mb-4">
                  We&apos;re setting up your first notebook with sample documents...
                </p>
                <div className="flex items-center justify-center space-x-2 text-purple-400">
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {[...Array(4)].map((_, index) => (
                  <div key={index} className="animate-pulse">
                    <div className="bg-slate-800/50 rounded-2xl h-48 flex flex-col justify-between p-6">
                      <div className="space-y-3">
                        <div className="h-4 bg-slate-700 rounded w-3/4"></div>
                        <div className="space-y-2">
                          <div className="h-3 bg-slate-700 rounded"></div>
                          <div className="h-3 bg-slate-700 rounded w-5/6"></div>
                        </div>
                      </div>
                      <div className="h-3 bg-slate-700 rounded w-1/2"></div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : recentNotebooks.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-slate-600" />
              </div>
              <h3 className="text-white font-medium mb-2">No notebooks yet</h3>
              <p className="text-gray-400 text-sm mb-6">
                Create your first notebook to get started with AI-powered document chat.
              </p>
              <Button onClick={createNotebook} className="bg-white text-slate-950 hover:bg-gray-100">
                <Plus className="w-4 h-4 mr-2" />
                Create your first notebook
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Create new notebook card - always first */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -4, scale: 1.02 }}
                onClick={createNotebook}
                className="bg-slate-800/50 border-2 border-dashed border-slate-700 rounded-2xl h-48 flex flex-col items-center justify-center cursor-pointer hover:border-slate-600 transition-colors group"
              >
                <div className="w-12 h-12 bg-purple-600/20 rounded-full flex items-center justify-center mb-4 group-hover:bg-purple-600/30 transition-colors">
                  <Plus className="w-6 h-6 text-purple-400" />
                </div>
                <h3 className="text-white font-medium mb-2">Create new notebook</h3>
                <p className="text-gray-400 text-sm text-center px-4">
                  Upload PDFs and start chatting with AI
                </p>
              </motion.div>

              {/* Existing notebooks */}
              {recentNotebooks.map((notebook, index) => (
                <motion.div
                  key={notebook.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * (index + 1) }}
                >
                  <NotebookCard notebook={notebook} />
                </motion.div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}