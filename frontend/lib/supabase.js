import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Public anon client (used in the browser)
const anonClient = createClient(supabaseUrl, supabaseAnonKey);

// Import admin client for server-side operations
let supabaseAdmin = null;
if (typeof window === 'undefined') {
  // Only import on server side
  try {
    const { supabaseAdmin: admin } = require('./supabase-admin');
    supabaseAdmin = admin;
  } catch (error) {
    console.warn('Could not load admin client:', error.message);
  }
}

// Exported client is environment-aware: the service-role client on the server
// (bypasses RLS), the public anon client in the browser. This means server-side
// callers never depend on anon table policies, so RLS can lock the anon role out
// of every table without breaking the app. The browser only ever holds the anon key.
export const supabase = (typeof window === 'undefined' && supabaseAdmin) ? supabaseAdmin : anonClient;

// Helper functions for common queries
export const challengeQueries = {
  // Get all active challenges with season information
  getActiveChallenges: async () => {
    const { data, error } = await supabase
      .from('challenges')
      .select(`
        *,
        seasons (
          id,
          name,
          start_date,
          end_date,
          is_current
        ),
        playlists (
          id,
          playlist_id,
          beatmap_title,
          beatmap_artist,
          beatmap_version,
          beatmap_difficulty,
          beatmap_cover_url,
          beatmap_card_url,
          beatmap_list_url,
          beatmap_slimcover_url
        )
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  // Get challenges by season
  getChallengesBySeason: async (seasonId) => {
    const { data, error } = await supabase
      .from('challenges')
      .select(`
        *,
        seasons (
          id,
          name,
          start_date,
          end_date,
          is_current
        ),
        playlists (
          id,
          playlist_id,
          beatmap_title,
          beatmap_artist,
          beatmap_version,
          beatmap_difficulty,
          beatmap_cover_url,
          beatmap_card_url,
          beatmap_list_url,
          beatmap_slimcover_url
        )
      `)
      .eq('season_id', seasonId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  // Get single challenge with all details
  getChallengeDetails: async (roomId) => {
    const { data, error } = await supabase
      .from('challenges')
      .select(`
        *,
        seasons (
          id,
          name,
          start_date,
          end_date,
          is_current
        ),
        playlists (
          *,
          scores (
            *,
            users (
              username,
              avatar_url,
              country
            )
          )
        )
      `)
      .eq('room_id', roomId)
      .single();

    if (error) throw error;
    
    // Sort scores for each playlist
    if (data?.playlists) {
      data.playlists = data.playlists.map(playlist => ({
        ...playlist,
        scores: playlist.scores?.sort((a, b) => b.score - a.score) || []
      }));
    }
    
    return data;
  },

  getChallengeLeaderboard: async (challengeId) => {
    const { data, error } = await supabase
      .rpc('get_challenge_leaderboard', { challenge_id: challengeId });

    if (error) throw error;
    return data || [];
  },

  // Get user scores
  getUserScores: async (userId) => {
    const { data, error } = await supabase
      .from('scores')
      .select(`
        *,
        playlists (
          *,
          challenges (
            name,
            custom_name,
            room_id,
            seasons (
              name
            )
          )
        )
      `)
      .eq('user_id', userId)
      .order('submitted_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  // Get user streak data using the PostgreSQL function
getUserStreaks: async (userId) => {
  console.log('🔥 getUserStreaks called with userId:', userId);
  
  try {
    const { data, error } = await supabase
      .rpc('get_user_streaks', { user_id_param: userId });

    if (error) {
      console.error('❌ Error calling get_user_streaks function:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      console.log('📈 No streak data returned, returning zeros');
      return {
        currentStreak: 0,
        longestStreak: 0,
        lastParticipatedDate: null,
        totalChallengesParticipated: 0,
        totalChallengesAvailable: 0,
        missedChallenges: 0
      };
    }

    const streakData = data[0];
    console.log('📈 Streak data from PostgreSQL function:', streakData);

    return {
      currentStreak: streakData.current_streak || 0,
      longestStreak: streakData.longest_streak || 0,
      lastParticipatedDate: streakData.last_participated_date,
      totalChallengesParticipated: streakData.total_challenges_participated || 0,
      totalChallengesAvailable: streakData.total_challenges_available || 0,
      missedChallenges: streakData.missed_challenges || 0
    };

  } catch (error) {
    console.error('🚨 Error in getUserStreaks:', error);
    // Return safe defaults on error
    return {
      currentStreak: 0,
      longestStreak: 0,
      lastParticipatedDate: null,
      totalChallengesParticipated: 0,
      totalChallengesAvailable: 0,
      missedChallenges: 0
    };
  }
},

getUserStats: async (userId) => {
  try {
    // Get comprehensive user statistics for the past 3 months only
    const { data: userStats, error: statsError } = await supabase
      .rpc('get_user_comprehensive_stats_3months', { user_id_param: userId });

    if (statsError) {
      console.error('Error fetching user stats (3 months):', statsError);
      throw statsError;
    }

    if (!userStats || userStats.length === 0) {
      console.log('No stats data returned for user');
      // Return default empty stats
      return {
        totalChallenges: 0,
        totalScores: 0,
        avgAccuracy: '0.00',
        avgScore: 0,
        avgRank: null,
        bestRank: null,
        worstRank: null,
        bestAccuracy: null,
        highestScore: null,
        participationRate: 0,
        improvementTrend: null,
        lastSubmission: null
      };
    }

    const stats = userStats[0];
    
    return {
      // Basic stats (past 3 months only)
      totalChallenges: stats.total_challenges || 0,
      totalScores: stats.total_scores || 0,
      
      // Averages (past 3 months only)
      avgAccuracy: stats.avg_accuracy ? parseFloat(stats.avg_accuracy).toFixed(2) : '0.00',
      avgScore: stats.avg_score ? Math.round(stats.avg_score) : 0,
      avgRank: stats.avg_rank ? Math.round(stats.avg_rank) : null,
      
      // Best/worst stats (past 3 months only)
      bestRank: stats.best_rank || null,
      worstRank: stats.worst_rank || null,
      bestAccuracy: stats.best_accuracy ? parseFloat(stats.best_accuracy).toFixed(2) : null,
      highestScore: stats.highest_score || null,
      
      // Additional insights (past 3 months only)
      participationRate: stats.participation_rate || 0,
      improvementTrend: stats.improvement_trend || null,
      lastSubmission: stats.last_submission || null
    };

  } catch (error) {
    console.error('Error in getUserStats (3 months):', error);
    throw error;
  }
}
};

// Season helper functions
export const seasonQueries = {
  // Get current season
  getCurrentSeason: async () => {
    const { data, error } = await supabase
      .from('seasons')
      .select('*')
      .eq('is_current', true)
      .single();

    if (error) throw error;
    return data;
  },

  // Get all seasons
  getAllSeasons: async () => {
    const { data, error } = await supabase
      .from('seasons')
      .select('*')
      .order('start_date', { ascending: false });

    if (error) throw error;
    return data;
  },

  // Create new season
  createSeason: async (seasonData) => {
    // Only admin can create seasons (this should be called server-side)
    const { data, error } = await supabase
      .from('seasons')
      .insert(seasonData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};

// Donation helper functions
export const donationQueries = {
  // Get user's donation history
  getUserDonations: async (userId) => {
    const { data, error } = await supabase
      .from('donations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  // Get total donations for a user
  getUserDonationTotal: async (userId) => {
    const { data, error } = await supabase
      .from('donations')
      .select('amount')
      .eq('user_id', userId)
      .eq('status', 'completed');

    if (error) throw error;
    
    const total = data?.reduce((sum, donation) => sum + parseFloat(donation.amount), 0) || 0;
    return total;
  },

  // Get recent donations (non-anonymous)
  getRecentDonations: async (limit = 10) => {
    const { data, error } = await supabase
      .from('donations')
      .select(`
        id,
        amount,
        created_at,
        anonymous,
        users (
          username,
          avatar_url
        )
      `)
      .eq('status', 'completed')
      .eq('anonymous', false)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  },

  // Get donation statistics
  getDonationStats: async () => {
    const { data, error } = await supabase
      .from('donations')
      .select('amount')
      .eq('status', 'completed');

    if (error) throw error;

    const total = data?.reduce((sum, donation) => sum + parseFloat(donation.amount), 0) || 0;
    const count = data?.length || 0;
    const average = count > 0 ? total / count : 0;

    return {
      totalAmount: total,
      totalCount: count,
      averageAmount: average
    };
  }
};

// Auth helper functions
export const auth = {
  getCurrentUser: async () => {
    console.log('🔍 auth.getCurrentUser() called');
    
    try {
      // Check if we're in browser environment
      if (typeof window === 'undefined') {
        console.log('❌ Server-side environment, no user');
        return null;
      }

      // Call our auth status API with cache busting
      console.log('📡 Calling auth status API...');
      const response = await fetch(`/api/auth/status?_=${Date.now()}`, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store' // Prevent browser caching
      });

      if (!response.ok) {
        console.error('❌ Auth status API failed:', response.status);
        return null;
      }

      const data = await response.json();
      console.log('📡 Auth status response:', data);

      if (!data.authenticated || !data.user) {
        console.log('❌ User not authenticated');
        return null;
      }

      console.log('✅ User authenticated successfully:', data.user.username, 'Admin:', data.user.admin);
      return data.user;

    } catch (error) {
      console.error('🚨 Error in getCurrentUser:', error);
      return null;
    }
  },

  // Check if user is admin
  isAdmin: async () => {
    const user = await auth.getCurrentUser();
    return user?.admin || false;
  },

  // Sign out
  signOut: async () => {
    console.log('🚪 Signing out...');
    
    try {
      // Call logout API which will clear the HttpOnly cookie
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });

      if (!response.ok) {
        console.warn('⚠️ Logout API failed, clearing manually');
      }
      
      console.log('✅ Signed out successfully');
    } catch (error) {
      console.error('🚨 Signout error:', error);
      throw error;
    }
  }
};

// Settings helper functions
export const settingsQueries = {
  // Get user settings
  getUserSettings: async (userId) => {
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code === 'PGRST116') {
      // No settings found, return defaults
      return {
        background_enabled: true,
        background_type: 'gradient',
        background_color: '#FFA500',
        background_gradient_end: '#FF6347',
        background_blur: 50,
        background_dimming: 50,
        background_saturation: 0,
        animations_enabled: true,
        number_format: 'abbreviated',
        default_profile_tab: 'recent',
        profile_visibility: 'public',
        background_id: null, // Updated field name
        donor_effects: {}
      };
    }

    if (error) throw error;
    return data;
  },

  // Update user settings
  updateUserSettings: async (userId, settings) => {
    const { data: existing } = await supabase
      .from('user_settings')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (existing) {
      // Update existing settings
      const { data, error } = await supabase
        .from('user_settings')
        .update({
          ...settings,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      // Create new settings
      const { data, error } = await supabase
        .from('user_settings')
        .insert({
          user_id: userId,
          ...settings
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  },

  // Get available backgrounds based on user donation status
  getAvailableBackgrounds: async (userId, totalDonations = 0) => {
    const { data, error } = await supabase
      .from('backgrounds')
      .select('*')
      .eq('is_active', true)
      .or(`category.eq.public,and(category.eq.donor,min_donation_total.lte.${totalDonations}),and(category.eq.premium,min_donation_total.lte.${totalDonations})`)
      .order('category', { ascending: true })
      .order('sort_order', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  // Get single background by ID
  getBackground: async (backgroundId) => {
    const { data, error } = await supabase
      .from('backgrounds')
      .select('*')
      .eq('id', backgroundId)
      .single();

    if (error) throw error;
    return data;
  },

  // Get all public backgrounds (for non-donors to see in UI)
  getPublicBackgrounds: async () => {
    const { data, error } = await supabase
      .from('backgrounds') // Updated table name
      .select('*')
      .eq('is_active', true)
      .eq('category', 'public')
      .order('sort_order', { ascending: true });

    if (error) throw error;
    return data || [];
  },

};