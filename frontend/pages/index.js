import { useState, useRef, useEffect } from 'react';
import Layout from '../components/Layout';
import { Trophy, Calendar, Gift, Zap, Users, Music, Sparkles, Info, ChevronRight, Star, Dice3, Award, Clock, AlertCircle, CheckCircle2, BarChart3, TrendingUp, Target, Download } from 'lucide-react';

export default function AboutChallengers() {
  const [activeTab, setActiveTab] = useState('weekly');
  const [clickCount, setClickCount] = useState(0);

  const [isFalling, setIsFalling] = useState(false);
  const [hasFallen, setHasFallen] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const trophyRef = useRef(null);
  const clickTimeoutRef = useRef(null);

  const handleTrophyClick = () => {
    if (hasFallen) return; // Don't allow clicking if trophy has already fallen
    
    setClickCount(prev => prev + 1);
    
    // Clear existing timeout
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
    }

    // Start shaking immediately
    setIsShaking(true);

    // Check if we've reached the threshold for falling
    if (clickCount >= 9) { // Falls on 10th click
      setIsFalling(true);
      setIsShaking(false);
      
      // Mark as fallen permanently after animation starts
      setTimeout(() => {
        setHasFallen(true);
      }, 100);
    } else {
      // Reset shake and click count after a delay if user stops clicking
      clickTimeoutRef.current = setTimeout(() => {
        setIsShaking(false);
        setClickCount(0);
      }, 1000);
    }
  };

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);

  return (
    <Layout>
      <div className="min-h-screen py-4 sm:py-6 lg:py-8">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6">
          {/* Header Section */}
          <div className="mb-8 sm:mb-10 lg:mb-12">
            <div className="text-center">
              {/* Trophy Animation Container */}
              <div className="relative inline-block mb-6 sm:mb-8">
                {!hasFallen && (
                  <Trophy 
                    ref={trophyRef}
                    onClick={handleTrophyClick}
                    className={`w-16 h-16 sm:w-24 sm:h-24 text-white relative z-10 icon-shadow-adaptive cursor-pointer transition-all duration-300 hover:scale-110 select-none ${
                      isFalling 
                        ? 'animate-trophy-fall' 
                        : isShaking 
                          ? 'animate-trophy-shake' 
                          : 'animate-float'
                    }`}
                    style={{
                      transform: isFalling ? 'translateY(200vh) rotate(720deg)' : 'none',
                      transition: isFalling ? 'transform 3s cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none'
                    }}
                  />
                )}
                
                {/* Click indicator */}
                {clickCount > 0 && !isFalling && !hasFallen && (
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
                    {clickCount}
                  </div>
                )}

                {/* Empty space placeholder when trophy is gone */}
                {hasFallen && (
                  <div className="w-16 h-16 sm:w-24 sm:h-24 opacity-20 flex items-center justify-center">
                    <div className="text-white/30 text-xs sm:text-sm text-center">
                      Trophy has fallen!<br />
                      <span className="text-xs">Reload to respawn</span>
                    </div>
                  </div>
                )}
              </div>
              
              <h1 className={`text-3xl sm:text-4xl lg:text-5xl font-black text-white text-shadow-adaptive-lg mb-4 sm:mb-6 transition-all duration-300 ${
                isFalling ? 'animate-text-bounce' : ''
              }`}>
                osu!Challengers
              </h1>
              
              <p className="text-base sm:text-lg lg:text-xl text-white/80 max-w-3xl mx-auto text-shadow-adaptive leading-relaxed px-4 sm:px-0">
                Welcome to osu!Challengers - a collection of competitive events where you can test your skills, win supporter, and have fun with the community!
              </p>
            </div>
          </div>

          {/* Event Types Grid */}
          <div className="mb-8 sm:mb-10">
            <div className="flex items-center gap-3 mb-6 sm:mb-8">
              <div className="p-2 sm:p-3 icon-gradient-purple rounded-lg sm:rounded-xl icon-container-purple">
                <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-white icon-shadow-adaptive" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white text-shadow-adaptive">
                Event Types
              </h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
              {/* Weekly Card */}
              <div
                className={`glass-1 flex flex-col rounded-xl sm:rounded-2xl p-4 sm:p-6 cursor-pointer transition-all duration-300 hover:shadow-2xl hover:bg-white/30 ${
                  activeTab === 'weekly' ? 'ring-2 ring-blue-400/60 glass-2' : ''
                }`}
                onClick={() => setActiveTab('weekly')}
              >
                {/* Header: icon and title */}
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 sm:p-3 icon-gradient-blue rounded-lg sm:rounded-xl icon-container-blue">
                      <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-white icon-shadow-adaptive" />
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold text-white text-shadow-adaptive">
                      o!C Weekly
                    </h3>
                  </div>

                  {/* Description */}
                  <p className="text-sm sm:text-base text-white/80 leading-relaxed text-shadow-adaptive-sm">
                    Standard weekly challenges with single maps. Difficulty increases throughout the month.
                  </p>
                </div>

                {/* Prize section aligned to bottom */}
                <div className="mt-auto pt-4">
                  <div className="glass-1 rounded-lg sm:rounded-xl p-2.5 sm:p-3 inline-flex items-center gap-2">
                    <Award className="w-4 h-4 sm:w-5 sm:h-5 text-white/90 icon-shadow-adaptive-sm" />
                    <span className="text-sm sm:text-base font-semibold text-white/90 text-shadow-adaptive-sm">
                      2 Supporter Prizes
                    </span>
                  </div>
                </div>
              </div>

              {/* CE Card */}
              <div
                className={`glass-1 flex flex-col rounded-xl sm:rounded-2xl p-4 sm:p-6 cursor-pointer transition-all duration-300 hover:shadow-2xl hover:bg-white/30 ${
                  activeTab === 'ce' ? 'ring-2 ring-purple-400/60 glass-2' : ''
                }`}
                onClick={() => setActiveTab('ce')}
              >
                {/* Header: icon and title */}
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 sm:p-3 icon-gradient-purple rounded-lg sm:rounded-xl icon-container-purple">
                      <Users className="w-5 h-5 sm:w-6 sm:h-6 text-white icon-shadow-adaptive" />
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold text-white text-shadow-adaptive">
                      o!C CE
                    </h3>
                  </div>

                  {/* Description */}
                  <p className="text-sm sm:text-base text-white/80 leading-relaxed text-shadow-adaptive-sm">
                    Cycle End events featuring all maps from the current season. Top 3 + raffle system!
                  </p>
                </div>

                {/* Prize section aligned to bottom */}
                <div className="mt-auto pt-4">
                  <div className="glass-1 rounded-lg sm:rounded-xl p-2.5 sm:p-3 inline-flex items-center gap-2">
                    <Award className="w-4 h-4 sm:w-5 sm:h-5 text-white/90 icon-shadow-adaptive-sm" />
                    <span className="text-sm sm:text-base font-semibold text-white/90 text-shadow-adaptive-sm">
                      6 Supporter Prizes
                    </span>
                  </div>
                </div>
              </div>

              {/* Custom Card */}
              <div
                className={`glass-1 flex flex-col rounded-xl sm:rounded-2xl p-4 sm:p-6 cursor-pointer transition-all duration-300 hover:shadow-2xl hover:bg-white/30 relative overflow-hidden ${
                  activeTab === 'custom' ? 'ring-2 ring-yellow-400/60 glass-2' : ''
                }`}
                onClick={() => setActiveTab('custom')}
              >
                {/* Header: icon and title */}
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 sm:p-3 icon-gradient-orange rounded-lg sm:rounded-xl icon-container-orange">
                      <Gift className="w-5 h-5 sm:w-6 sm:h-6 text-white icon-shadow-adaptive" />
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold text-white text-shadow-adaptive">
                      o!C Custom
                    </h3>
                  </div>

                  {/* Description */}
                  <p className="text-sm sm:text-base text-white/80 leading-relaxed text-shadow-adaptive-sm">
                    Special events with custom maps and songs created just for you!
                  </p>
                </div>

                {/* Prize section aligned to bottom */}
                <div className="mt-auto pt-4">
                  <div className="glass-1 rounded-lg sm:rounded-xl p-2.5 sm:p-3 inline-flex items-center gap-2">
                    <Award className="w-4 h-4 sm:w-5 sm:h-5 text-white/90 icon-shadow-adaptive-sm" />
                    <span className="text-sm sm:text-base font-semibold text-white/90 text-shadow-adaptive-sm">
                      6 Months + Merch
                    </span>
                  </div>
                </div>

                {/* Badge on top right */}
                <span className="absolute top-3 right-3 px-2.5 py-1 bg-gradient-to-b from-yellow-400 to-orange-400 text-white text-xs font-bold rounded-full shadow-lg">
                  Under Development
                </span>
              </div>
            </div>
          </div>

          {/* Tab Content Container */}
          <div className="glass-1 rounded-xl sm:rounded-2xl overflow-hidden mb-8 sm:mb-10">
            {/* Tab Navigation */}
            <div className="p-4 sm:p-6 border-b border-white/10">
              <div className="view-mode-slider">
                <div className="slider-track">
                  <div className="slider-thumb" style={{
                    left: activeTab === 'weekly' ? '4px' : 
                          activeTab === 'ce' ? 'calc(33.33% + 4px)' :
                          'calc(66.66% + 4px)',
                    width: 'calc(33.33% - 8px)',
                  }} />
                  <button
                    onClick={() => setActiveTab('weekly')}
                    className={`slider-option ${activeTab === 'weekly' ? 'slider-option-active' : ''}`}
                  >
                    <span className="hidden sm:inline">Weekly Details</span>
                    <span className="sm:hidden">Weekly</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('ce')}
                    className={`slider-option ${activeTab === 'ce' ? 'slider-option-active' : ''}`}
                  >
                    <span className="hidden sm:inline">CE Details</span>
                    <span className="sm:hidden">CE</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('custom')}
                    className={`slider-option ${activeTab === 'custom' ? 'slider-option-active' : ''}`}
                  >
                    <span className="hidden sm:inline">Custom Details</span>
                    <span className="sm:hidden">Custom</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Tab Content */}
            <div className="p-4 sm:p-6 lg:p-8">
              {activeTab === 'weekly' && (
                <div className="space-y-6 sm:space-y-8">
                  <div>
                    <p className="text-base sm:text-lg text-white/90 leading-relaxed text-shadow-adaptive">
                      Every week, a new Playlist is created in Lazer containing exactly <span className="font-bold text-white">1 map</span>. 
                      The difficulty progression throughout the month is carefully designed to challenge players of all skill levels.
                    </p>
                  </div>
                  
                  {/* Difficulty Progression */}
                  <div>
                    <h4 className="text-lg sm:text-xl font-bold text-white mb-4 sm:mb-6 flex items-center gap-2 text-shadow-adaptive">
                      <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 icon-shadow-adaptive" />
                      Difficulty Progression
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                      <div className="text-center glass-1 rounded-lg sm:rounded-xl p-3 sm:p-4">
                        <div className="text-xl sm:text-2xl font-black text-white mb-1 text-shadow-adaptive">Week 1</div>
                        <div className="text-sm sm:text-base font-semibold text-white/90 text-shadow-adaptive-sm">5.50★ - 5.99★</div>
                      </div>
                      <div className="text-center glass-1 rounded-lg sm:rounded-xl p-3 sm:p-4">
                        <div className="text-xl sm:text-2xl font-black text-white mb-1 text-shadow-adaptive">Week 2</div>
                        <div className="text-sm sm:text-base font-semibold text-white/90 text-shadow-adaptive-sm">6.00★ - 6.49★</div>
                      </div>
                      <div className="text-center glass-1 rounded-lg sm:rounded-xl p-3 sm:p-4">
                        <div className="text-xl sm:text-2xl font-black text-white mb-1 text-shadow-adaptive">Week 3</div>
                        <div className="text-sm sm:text-base font-semibold text-white/90 text-shadow-adaptive-sm">6.50★ - 6.99★</div>
                      </div>
                      <div className="text-center glass-1 rounded-lg sm:rounded-xl p-3 sm:p-4">
                        <div className="text-xl sm:text-2xl font-black text-white mb-1 text-shadow-adaptive">Week 4</div>
                        <div className="text-sm sm:text-base font-semibold text-white/90 text-shadow-adaptive-sm">7.00★ - 7.49★</div>
                      </div>
                    </div>
                  </div>

                  {/* How to Win */}
                  <div>
                    <h4 className="text-lg sm:text-xl font-bold text-white mb-4 sm:mb-6 flex items-center gap-2 text-shadow-adaptive">
                      <Trophy className="w-5 h-5 sm:w-6 sm:h-6 icon-shadow-adaptive" />
                      How to Win Supporter
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <div className="glass-1 rounded-lg sm:rounded-xl p-4 sm:p-6">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="p-2 icon-gradient-green rounded-lg icon-container-green">
                            <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-white icon-shadow-adaptive-sm" />
                          </div>
                          <h5 className="text-base sm:text-lg font-semibold text-white text-shadow-adaptive">Highest Score</h5>
                        </div>
                        <p className="text-sm sm:text-base text-white/80 leading-relaxed text-shadow-adaptive-sm">
                          Win the Playlist by achieving the highest overall score across all difficulties
                        </p>
                      </div>
                      <div className="glass-1 rounded-lg sm:rounded-xl p-4 sm:p-6">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="p-2 icon-gradient-purple rounded-lg icon-container-purple">
                            <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-white icon-shadow-adaptive-sm" />
                          </div>
                          <h5 className="text-base sm:text-lg font-semibold text-white text-shadow-adaptive">Mod Challenge</h5>
                        </div>
                        <p className="text-sm sm:text-base text-white/80 leading-relaxed text-shadow-adaptive-sm">
                          Get the best score with the specific mod chosen for that week
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'ce' && (
                <div className="space-y-6 sm:space-y-8">
                  <div>
                    <p className="text-base sm:text-lg text-white/90 leading-relaxed text-shadow-adaptive">
                      Three days before the end of each month, a special collage is created containing <span className="font-bold text-white">all Weekly maps </span> 
                      from the current season. This creates massive multi-map challenges that test your consistency across all difficulty levels!
                    </p>
                  </div>
                  
                  {/* Prize Distribution */}
                  <div className="glass-1 rounded-lg sm:rounded-xl p-4 sm:p-6">
                    <h4 className="text-lg sm:text-xl font-bold text-white mb-4 flex items-center gap-2 text-shadow-adaptive">
                      <Award className="w-5 h-5 sm:w-6 sm:h-6 icon-shadow-adaptive" />
                      Prize Distribution
                    </h4>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 sm:gap-4">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-b from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center text-white font-bold text-base sm:text-lg shadow-lg">
                          1
                        </div>
                        <span className="text-sm sm:text-base font-semibold text-white text-shadow-adaptive-sm">
                          Top 3 on leaderboard: 1 month Supporter each
                        </span>
                      </div>
                      <div className="flex items-center gap-3 sm:gap-4">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-b from-purple-400 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-base sm:text-lg shadow-lg">
                          2
                        </div>
                        <span className="text-sm sm:text-base font-semibold text-white text-shadow-adaptive-sm">
                          Raffle winners (3 people): 1 month Supporter each
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Raffle System */}
                  <div className="glass-1 rounded-lg sm:rounded-xl p-4 sm:p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 icon-gradient-purple rounded-lg icon-container-purple">
                        <Dice3 className="w-5 h-5 sm:w-6 sm:h-6 text-white icon-shadow-adaptive" />
                      </div>
                      <h4 className="text-lg sm:text-xl font-bold text-white text-shadow-adaptive">How the Raffle Works</h4>
                    </div>
                    <ul className="space-y-2 sm:space-y-3">
                      <li className="flex items-start gap-2 sm:gap-3">
                        <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 mt-0.5 flex-shrink-0 text-white/70 icon-shadow-adaptive-sm" />
                        <span className="text-sm sm:text-base text-white/90 text-shadow-adaptive-sm">Entry requires completing each map</span>
                      </li>
                      <li className="flex items-start gap-2 sm:gap-3">
                        <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 mt-0.5 flex-shrink-0 text-white/70 icon-shadow-adaptive-sm" />
                        <span className="text-sm sm:text-base text-white/90 text-shadow-adaptive-sm">3 winners will be drawn</span>
                      </li>
                      <li className="flex items-start gap-2 sm:gap-3">
                        <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 mt-0.5 flex-shrink-0 text-white/70 icon-shadow-adaptive-sm" />
                        <span className="text-sm sm:text-base text-white/90 text-shadow-adaptive-sm">Names are removed once drawn</span>
                      </li>
                    </ul>
                  </div>
                </div>
              )}

              {activeTab === 'custom' && (
                <div className="space-y-6 sm:space-y-8">
                  <div className="glass-1 rounded-lg sm:rounded-xl p-4 sm:p-6 transition-all">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 icon-gradient-green rounded-lg icon-container-green">
                        <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-white icon-shadow-adaptive" />
                      </div>
                      <h4 className="text-lg sm:text-xl font-semibold text-white text-shadow-adaptive">Something Special!</h4>
                    </div>
                    <p className="text-sm sm:text-base text-white/80 leading-relaxed text-shadow-adaptive-sm">
                      Custom events feature <span className="font-bold text-white">custom commissioned maps</span> with 
                      <span className="font-bold text-white"> brand new songs</span> created exclusively for osu!Challengers participants! 
                      This is a completely unique experience you won't find anywhere else.
                    </p>
                  </div>

                  {/* Prize Pool */}
                  <div className="glass-1 rounded-lg sm:rounded-xl p-4 sm:p-6">
                    <h4 className="text-lg sm:text-xl font-bold text-white mb-4 flex items-center gap-2 text-shadow-adaptive">
                      Prize Pool
                    </h4>
                    <div className="flex items-center gap-4 sm:gap-6">
                      <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-b from-yellow-400 to-orange-500 rounded-2xl sm:rounded-3xl flex items-center justify-center shadow-xl">
                        <Trophy className="w-8 h-8 sm:w-10 sm:h-10 text-white icon-shadow-adaptive" />
                      </div>
                      <div>
                        <h5 className="font-bold text-white text-lg sm:text-xl mb-1 text-shadow-adaptive">
                          6 Months of osu!supporter
                        </h5>
                        <p className="text-sm sm:text-base text-white/90 text-shadow-adaptive-sm">
                          Plus your choice of official osu! merchandise up to 80USD total!
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 glass-1 rounded-lg p-3 flex items-center gap-2">
                      <Info className="w-4 h-4 text-white/80 icon-shadow-adaptive-sm" />
                      <span className="text-xs sm:text-sm text-white/80 text-shadow-adaptive-sm">
                        Merchandise must be in stock on the official osu! store
                      </span>
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="inline-flex items-center gap-3 px-6 py-3 sm:px-8 sm:py-4 bg-gradient-to-b from-yellow-500 to-orange-500 text-white font-bold rounded-full shadow-lg text-base sm:text-lg">
                      <Clock className="w-5 h-5 sm:w-6 sm:h-6" />
                      Currently in Production - Stay Tuned!
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Rules Section */}
          <div className="glass-1 rounded-xl sm:rounded-2xl p-4 sm:p-6 lg:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 sm:p-3 icon-gradient-orange rounded-lg sm:rounded-xl icon-container-orange">
                <Info className="w-5 h-5 sm:w-6 sm:h-6 text-white icon-shadow-adaptive" />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-white text-shadow-adaptive">
                Important Guidelines
              </h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              <div className="glass-1 rounded-lg sm:rounded-xl p-4 sm:p-6">
                <h4 className="font-bold text-white mb-3 flex items-center gap-2 text-shadow-adaptive">
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-white/90 icon-shadow-adaptive-sm" />
                  Mod Challenges
                </h4>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-white/70 mt-1 text-shadow-adaptive-sm">•</span>
                    <span className="text-sm sm:text-base text-white/80 text-shadow-adaptive-sm">
                      Unless specified in the Playlist description, mod challenges must use default settings
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-white/70 mt-1 text-shadow-adaptive-sm">•</span>
                    <span className="text-sm sm:text-base text-white/80 text-shadow-adaptive-sm">
                      You can add other mods, even ones that change the main mod's difficulty
                    </span>
                  </li>
                </ul>
              </div>
              
              <div className="glass-1 rounded-lg sm:rounded-xl p-4 sm:p-6">
                <h4 className="font-bold text-white mb-3 flex items-center gap-2 text-shadow-adaptive">
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-white/90 icon-shadow-adaptive-sm" />
                  Score Visibility
                </h4>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-white/70 mt-1 text-shadow-adaptive-sm">•</span>
                    <span className="text-sm sm:text-base text-white/80 text-shadow-adaptive-sm">
                      Your winning score must be publicly visible on the official Playlist leaderboard
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-white/70 mt-1 text-shadow-adaptive-sm">•</span>
                    <span className="text-sm sm:text-base text-white/80 text-shadow-adaptive-sm">
                      Screenshots of non-visible plays won't count
                    </span>
                  </li>
                </ul>
              </div>

              <div className="glass-1 rounded-lg sm:rounded-xl p-4 sm:p-6 md:col-span-2">
                <h4 className="font-bold text-white mb-3 flex items-center gap-2 text-shadow-adaptive">
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-white/90 icon-shadow-adaptive-sm" />
                  Fair Play & Sportsmanship
                </h4>
                <p className="text-sm sm:text-base text-white/80 text-shadow-adaptive-sm">
                  Respect all participants and their achievements. Everyone is trying their best, and that deserves recognition. 
                  Keep the competition friendly and fun!
                </p>
              </div>
            </div>

            <div className="mt-6 glass-1 rounded-lg p-4 border border-orange-400/30">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-orange-400 mt-0.5 flex-shrink-0 icon-shadow-adaptive-sm" />
                <p className="text-sm sm:text-base text-white/80 text-shadow-adaptive-sm">
                  <span className="font-bold text-white">Note:</span> Violation of these guidelines may result in exclusion from future events. 
                  Guidelines may be updated to ensure a positive experience for all participants.
                </p>
              </div>
            </div>
          </div>

          {/* Browser Extensions Section */}
          <div className="mt-8 sm:mt-10 lg:mt-12 mb-8 sm:mb-10">
            <div className="text-center mb-6 sm:mb-8">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="p-2 sm:p-3 icon-gradient-blue rounded-lg sm:rounded-xl icon-container-blue">
                  <Download className="w-5 h-5 sm:w-6 sm:h-6 text-white icon-shadow-adaptive" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-white text-shadow-adaptive">
                  Quick Access Tools
                </h2>
              </div>
              
              <p className="text-white/85 text-sm sm:text-base lg:text-lg max-w-2xl mx-auto text-shadow-adaptive px-4 sm:px-0">
                View your osu!Challengers stats directly on the osu! website with our browser extension!
              </p>
            </div>

            {/* Extension Preview Card */}
            <div className="glass-1 rounded-xl sm:rounded-2xl overflow-hidden mb-6 sm:mb-8 max-w-5xl mx-auto">
              <div className="flex flex-col lg:flex-row h-auto lg:h-96">
                {/* Screenshot Side - Fixed square on desktop */}
                <div className="relative w-full lg:w-96 h-64 sm:h-80 lg:h-96 flex-shrink-0 overflow-hidden">
                  <img 
                    src="/extension-preview.png" 
                    alt="osu!Challengers Extension Preview"
                    className="w-full h-full object-cover"
                  />
                </div>
                
                {/* Text Side */}
                <div className="p-6 sm:p-8 lg:p-10 flex flex-col justify-center items-center text-center flex-grow">
                  <div className="max-w-lg">
                    <h3 className="text-xl sm:text-2xl font-bold text-white mb-4 text-shadow-adaptive">
                      Stats on Your Profile
                    </h3>
                    <ul className="space-y-3 mb-6 text-left">
                      <li className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0 icon-shadow-adaptive-sm" />
                        <span className="text-sm sm:text-base text-white/90 text-shadow-adaptive-sm">
                          View your osu!Challengers performance directly on osu! profiles
                        </span>
                      </li>
                      <li className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0 icon-shadow-adaptive-sm" />
                        <span className="text-sm sm:text-base text-white/90 text-shadow-adaptive-sm">
                          Track your seasonal rank, total score, and top performances
                        </span>
                      </li>
                      <li className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0 icon-shadow-adaptive-sm" />
                        <span className="text-sm sm:text-base text-white/90 text-shadow-adaptive-sm">
                          Integrated directly into the osu! website design
                        </span>
                      </li>
                    </ul>
                    <p className="text-xs sm:text-sm text-white/70 text-shadow-adaptive-sm">
                      Developed by Paraliyzed_evo & Thunderbirdo
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Download Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
              <a
                href="https://addons.mozilla.org/en-US/firefox/addon/osu-challengers/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-6 py-4 sm:px-8 sm:py-5 glass-2 rounded-xl sm:rounded-2xl hover:glass-3 transition-all duration-300 text-white text-shadow-adaptive transform hover:scale-105 hover:shadow-xl group"
              >
                <div className="p-2.5 sm:p-3 bg-gradient-to-b from-orange-500 to-orange-600 rounded-lg group-hover:from-orange-400 group-hover:to-orange-500 transition-all">
                  <Download className="w-5 h-5 sm:w-6 sm:h-6 icon-shadow-adaptive-sm" />
                </div>
                <div className="text-left">
                  <div className="font-bold text-base sm:text-lg">Firefox Extension</div>
                  <div className="text-xs sm:text-sm text-white/70">For Firefox Browser</div>
                </div>
              </a>
              
              <a
                href="https://chromewebstore.google.com/detail/osuchallengers/ghfcjealgjkjpndjlicmcabbgakphien"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-6 py-4 sm:px-8 sm:py-5 glass-2 rounded-xl sm:rounded-2xl hover:glass-3 transition-all duration-300 text-white text-shadow-adaptive transform hover:scale-105 hover:shadow-xl group"
              >
                <div className="p-2.5 sm:p-3 bg-gradient-to-b from-blue-500 to-blue-600 rounded-lg group-hover:from-blue-400 group-hover:to-blue-500 transition-all">
                  <Download className="w-5 h-5 sm:w-6 sm:h-6 icon-shadow-adaptive-sm" />
                </div>
                <div className="text-left">
                  <div className="font-bold text-base sm:text-lg">Chrome Extension</div>
                  <div className="text-xs sm:text-sm text-white/70">For Chrome & Edge</div>
                </div>
              </a>
            </div>
          </div>

          {/* Footer CTA */}
          <div className="mt-8 sm:mt-10 text-center">
            <div className="inline-flex flex-col items-center gap-4 sm:gap-6 px-6 py-6 sm:px-10 sm:py-8 glass-2 rounded-2xl sm:rounded-3xl shadow-2xl">
              <div className="flex items-center gap-4">
                <h3 className="text-xl sm:text-2xl font-bold text-white text-shadow-adaptive">Ready to Compete?</h3>
              </div>
              <p className="text-sm sm:text-lg text-white/80 max-w-2xl leading-relaxed text-shadow-adaptive-sm">
                Jump into the current challenge and show what you've got! Every map is an opportunity to prove your skills and win amazing prizes.
              </p>
              <div className="flex items-center gap-3 text-white font-bold">
                <Star className="w-5 h-5 sm:w-6 sm:h-6 icon-shadow-adaptive" />
                <span className="text-base sm:text-lg text-shadow-adaptive">Good luck and have fun!</span>
                <Star className="w-5 h-5 sm:w-6 sm:h-6 icon-shadow-adaptive" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Custom CSS for animations */}
      <style jsx>{`
        @keyframes trophy-shake {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          10% { transform: translateX(-2px) rotate(-1deg); }
          20% { transform: translateX(2px) rotate(1deg); }
          30% { transform: translateX(-2px) rotate(-1deg); }
          40% { transform: translateX(2px) rotate(1deg); }
          50% { transform: translateX(-1px) rotate(-0.5deg); }
          60% { transform: translateX(1px) rotate(0.5deg); }
          70% { transform: translateX(-1px) rotate(-0.5deg); }
          80% { transform: translateX(1px) rotate(0.5deg); }
          90% { transform: translateX(-0.5px) rotate(-0.25deg); }
        }

        @keyframes text-bounce {
          0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
          10% { transform: translateY(-5px); }
          30% { transform: translateY(-3px); }
          60% { transform: translateY(-2px); }
          90% { transform: translateY(-1px); }
        }

        .animate-trophy-shake {
          animation: trophy-shake 0.5s ease-in-out infinite;
        }

        .animate-text-bounce {
          animation: text-bounce 0.8s ease-in-out;
        }

        /* Subtle hint animation when trophy is being clicked */
        .trophy-clickable {
          transition: all 0.2s ease;
        }

        .trophy-clickable:hover {
          filter: brightness(1.2);
          transform: scale(1.05);
        }

        .trophy-clickable:active {
          transform: scale(0.95);
        }
      `}</style>
    </Layout>
  );
}