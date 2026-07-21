// frontend/lib/seasons.js
// Server-only module (imported by API routes). Uses the service-role client so it
// works under RLS without granting the anon role any access to the seasons table.
import { supabaseAdmin } from './supabase-admin';

// Season utility functions
export const seasonUtils = {
  // Check if we need to rotate seasons (6-month rotation)
  shouldRotateSeason: (currentSeason) => {
    if (!currentSeason) return true;
    
    const now = new Date();
    const seasonEnd = new Date(currentSeason.end_date);
    
    return now > seasonEnd;
  },

  // Generate season name based on current date (6-month seasons)
  generateSeasonName: async (date = new Date(), supabaseInstance = null) => {
    try {
      // Use provided instance or default to the service-role admin client
      const supabaseToUse = supabaseInstance || supabaseAdmin;
      
      // Get all existing seasons to determine next number
      const { data: seasons, error } = await supabaseToUse
        .from('seasons')
        .select('name')
        .order('id', { ascending: false });
      
      if (error) {
        console.error('Error fetching seasons for name generation:', error);
        return 'Season 1'; // Default fallback
      }
      
      // Find the highest season number
      let nextSeasonNumber = 1;
      if (seasons && seasons.length > 0) {
        const seasonNumbers = seasons
          .map(season => {
            const match = season.name.match(/^Season (\d+)$/);
            return match ? parseInt(match[1]) : 0;
          })
          .filter(num => num > 0);
        
        if (seasonNumbers.length > 0) {
          nextSeasonNumber = Math.max(...seasonNumbers) + 1;
        }
      }
      
      return `Season ${nextSeasonNumber}`;
    } catch (error) {
      console.error('Error generating season name:', error);
      return 'Season 1';
    }
  },

  // Get season date range for a given year and half (1 = Spring, 2 = Fall)
  getSeasonDateRange: (year, half) => {
    let start, end;
    
    if (half === 1) {
      // Spring season: January 1 - June 30 (UTC)
      start = new Date(Date.UTC(year, 0, 1, 0, 0, 0)); // January 1 UTC
      end = new Date(Date.UTC(year, 5, 30, 23, 59, 59)); // June 30 UTC
    } else {
      // Fall season: July 1 - December 31 (UTC)
      start = new Date(Date.UTC(year, 6, 1, 0, 0, 0)); // July 1 UTC
      end = new Date(Date.UTC(year, 11, 31, 23, 59, 59)); // December 31 UTC
    }
    
    return {
      start_date: start.toISOString(),
      end_date: end.toISOString()
    };
  },

  // Get current season info (which half of year we're in)
  getCurrentSeasonInfo: (date = new Date()) => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const half = month <= 6 ? 1 : 2;
    
    return { year, half };
  },

  // Auto-rotate season if needed (6-month rotation)
  autoRotateSeason: async (supabaseInstance = null) => {
    try {
      const supabaseToUse = supabaseInstance || supabaseAdmin;
      
      const { data: currentSeason } = await supabaseToUse
        .from('seasons')
        .select('*')
        .eq('is_current', true)
        .single();

      if (seasonUtils.shouldRotateSeason(currentSeason)) {
        const now = new Date();
        const { year, half } = seasonUtils.getCurrentSeasonInfo(now);
        const dateRange = seasonUtils.getSeasonDateRange(year, half);
        
        // Get next season number
        const newSeasonName = await seasonUtils.generateSeasonName(now, supabaseToUse);

        // Mark current season as not current
        if (currentSeason) {
          await supabaseToUse
            .from('seasons')
            .update({ is_current: false })
            .eq('id', currentSeason.id);
        }

        // Create new current season
        const { data: newSeason, error } = await supabaseToUse
          .from('seasons')
          .insert({
            name: newSeasonName,
            start_date: dateRange.start_date,
            end_date: dateRange.end_date,
            is_current: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();

        if (error) {
          console.error('Error creating new season:', error);
          return null;
        }

        console.log('Season rotated to:', newSeasonName);
        return newSeason;
      }

      return currentSeason;
    } catch (error) {
      console.error('Error in auto-rotate season:', error);
      return null;
    }
  },

  // Get current season with auto-rotation
  getCurrentSeasonWithRotation: async () => {
    return await seasonUtils.autoRotateSeason();
  },

  // Format season display name
  formatSeasonName: (season) => {
    if (!season) return 'Unknown Season';
    return season.name;
  },

  // Format season date range for display
  formatSeasonDateRange: (season) => {
    if (!season || !season.start_date || !season.end_date) return '';
    
    const start = new Date(season.start_date);
    const end = new Date(season.end_date);
    
    const startStr = start.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
    const endStr = end.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
    
    return `${startStr} - ${endStr}`;
  },

  // Check if a date falls within a season
  isDateInSeason: (date, season) => {
    if (!season) return false;
    
    const checkDate = new Date(date);
    const seasonStart = new Date(season.start_date);
    const seasonEnd = new Date(season.end_date);
    
    return checkDate >= seasonStart && checkDate <= seasonEnd;
  },

  // Get the season that contains a specific date
  getSeasonForDate: async (date) => {
    try {
      const { data: seasons, error } = await supabaseAdmin
        .from('seasons')
        .select('*')
        .order('start_date', { ascending: false });

      if (error) throw error;

      for (const season of seasons) {
        if (seasonUtils.isDateInSeason(date, season)) {
          return season;
        }
      }

      return null;
    } catch (error) {
      console.error('Error finding season for date:', error);
      return null;
    }
  },

  // Group challenges by season
  groupChallengesBySeason: (challenges) => {
    const grouped = {};
    
    challenges.forEach(challenge => {
      const seasonName = challenge.seasons?.name || 'Unknown Season';
      if (!grouped[seasonName]) {
        grouped[seasonName] = {
          season: challenge.seasons,
          challenges: []
        };
      }
      grouped[seasonName].challenges.push(challenge);
    });
    
    // Sort groups by season start date (most recent first)
    const sortedGroups = {};
    Object.keys(grouped)
      .sort((a, b) => {
        const seasonA = grouped[a].season;
        const seasonB = grouped[b].season;
        
        if (!seasonA || !seasonB) return 0;
        
        const dateA = new Date(seasonA.start_date);
        const dateB = new Date(seasonB.start_date);
        
        return dateB - dateA; // Most recent first
      })
      .forEach(key => {
        sortedGroups[key] = grouped[key];
      });
    
    return sortedGroups;
  },

  // Get season statistics
  getSeasonStats: async (seasonId) => {
    try {
      const { data: challenges, error: challengesError } = await supabaseAdmin
        .from('challenges')
        .select(`
          id,
          participant_count,
          playlists (
            id,
            scores (
              id
            )
          )
        `)
        .eq('season_id', seasonId);

      if (challengesError) throw challengesError;

      const totalChallenges = challenges.length;
      const totalParticipants = challenges.reduce((sum, c) => sum + (c.participant_count || 0), 0);
      const totalScores = challenges.reduce((sum, c) => {
        return sum + c.playlists.reduce((playlistSum, p) => playlistSum + p.scores.length, 0);
      }, 0);

      return {
        totalChallenges,
        totalParticipants,
        totalScores,
        avgParticipantsPerChallenge: totalChallenges > 0 ? Math.round(totalParticipants / totalChallenges) : 0
      };
    } catch (error) {
      console.error('Error getting season stats:', error);
      return {
        totalChallenges: 0,
        totalParticipants: 0,
        totalScores: 0,
        avgParticipantsPerChallenge: 0
      };
    }
  },

  // Validate season dates
  validateSeasonDates: (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const errors = [];

    if (isNaN(start.getTime())) {
      errors.push('Invalid start date');
    }

    if (isNaN(end.getTime())) {
      errors.push('Invalid end date');
    }

    if (start >= end) {
      errors.push('Start date must be before end date');
    }

    // Check if dates align with 6-month seasons
    const startMonth = start.getMonth() + 1;
    const endMonth = end.getMonth() + 1;
    const startDay = start.getDate();
    const endDay = end.getDate();

    if (!((startMonth === 1 && startDay === 1) || (startMonth === 7 && startDay === 1))) {
      errors.push('Season should start on January 1st or July 1st');
    }

    if (!((endMonth === 6 && endDay === 30) || (endMonth === 12 && endDay === 31))) {
      errors.push('Season should end on June 30th or December 31st');
    }

    return errors;
  },

  // Create a new season programmatically
  createSeason: async (year, half, customName = null) => {
    try {
      let seasonName;
      
      if (customName) {
        seasonName = customName;
      } else {
        // Generate next incremental name
        seasonName = await seasonUtils.generateSeasonName();
      }
      
      const dateRange = seasonUtils.getSeasonDateRange(year, half);

      const { data: season, error } = await supabaseAdmin
        .from('seasons')
        .insert({
          name: seasonName,
          start_date: dateRange.start_date,
          end_date: dateRange.end_date,
          is_current: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      return season;
    } catch (error) {
      console.error('Error creating season:', error);
      return null;
    }
  },

  getSeasonNumber: (seasonName) => {
    if (!seasonName) return null;
    const match = seasonName.match(/^Season (\d+)$/);
    return match ? parseInt(match[1]) : null;
  },

  // Get next season info
  getNextSeasonInfo: async (currentSeason) => {
    if (!currentSeason) return null;

    const currentStart = new Date(currentSeason.start_date);
    const currentYear = currentStart.getFullYear();
    const currentMonth = currentStart.getMonth() + 1;

    let nextYear, nextHalf;
    
    if (currentMonth <= 6) {
      // Current is first half, next is second half same year
      nextYear = currentYear;
      nextHalf = 2;
    } else {
      // Current is second half, next is first half next year
      nextYear = currentYear + 1;
      nextHalf = 1;
    }

    const nextSeasonName = await seasonUtils.generateSeasonName();
    const nextDateRange = seasonUtils.getSeasonDateRange(nextYear, nextHalf);

    return {
      year: nextYear,
      half: nextHalf,
      name: nextSeasonName,
      number: seasonUtils.getSeasonNumber(nextSeasonName),
      ...nextDateRange
    };
  },
  
  // Check if it's time to create next season (30 days before current ends)
  shouldCreateNextSeason: (currentSeason) => {
    if (!currentSeason) return false;

    const now = new Date();
    const seasonEnd = new Date(currentSeason.end_date);
    const thirtyDaysBeforeEnd = new Date(seasonEnd.getTime() - (30 * 24 * 60 * 60 * 1000));

    return now >= thirtyDaysBeforeEnd;
  }
};