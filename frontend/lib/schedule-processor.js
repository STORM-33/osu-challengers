import { supabaseAdmin } from './supabase-admin';
import { osuAPI } from './osu-api';
import { decryptToken, parseToken, isTokenExpired, createTokenString, encryptToken, maskToken } from './token-encryption';

/**
 * Process a single scheduled challenge.
 * Shared between the cron runner (/api/cron/process-scheduled-challenges)
 * and the admin retry endpoint (POST /api/admin/schedules).
 */
export async function processSchedule(schedule) {
  const scheduleId = schedule.id;
  const scheduledFor = new Date(schedule.scheduled_time);
  const delay = Date.now() - scheduledFor.getTime();

  console.log(`\n🎯 Processing schedule #${scheduleId}:`);
  console.log(`    Room: ${schedule.room_data?.name}`);
  console.log(`    Scheduled for: ${scheduledFor.toISOString()}`);
  console.log(`    Delay: ${Math.round(delay / 1000)}s`);
  console.log(`    Has ruleset config: ${!!schedule.ruleset_config}`);  // NEW: Log ruleset config

  try {
    // Check if already being processed (race condition protection)
    const { data: current } = await supabaseAdmin
      .from('scheduled_challenges')
      .select('status')
      .eq('id', scheduleId)
      .single();

    if (current?.status !== 'pending') {
      console.log(`⚠️ Schedule #${scheduleId} already processed (status: ${current?.status})`);
      return {
        success: false,
        scheduleId,
        error: 'Already processed',
        skipped: true
      };
    }

    // Steps 1+2: Resolve a usable access token.
    // Stored token first: it's the exclusively-owned chain (rotated on store,
    // kept alive by login checks and cron refreshes), so it survives long
    // lead times. The token embedded in the schedule is the fallback: fresh
    // at scheduling time, but its chain usually gets consumed by the
    // scheduler site's own cookie re-login within days.
    console.log('🔐 Step 1: Resolving user token (stored first, embedded fallback)...');

    const candidates = [];

    const { data: userToken } = await supabaseAdmin
      .from('user_osu_tokens')
      .select('encrypted_token')
      .eq('osu_id', schedule.osu_id)
      .maybeSingle();

    if (userToken?.encrypted_token) {
      candidates.push({ source: 'stored', encrypted: userToken.encrypted_token });
    }
    if (schedule.encrypted_token) {
      candidates.push({ source: 'embedded', encrypted: schedule.encrypted_token });
    }

    if (candidates.length === 0) {
      console.error('❌ No stored token found for user');

      await supabaseAdmin
        .from('scheduled_challenges')
        .update({
          status: 'failed',
          error_message: 'No stored token found for user. User must set token via POST /api/admin/user-token',
          executed_at: new Date().toISOString()
        })
        .eq('id', scheduleId);

      return {
        success: false,
        scheduleId,
        error: 'No stored token found'
      };
    }

    let accessToken = null;
    let tokenSource = null;
    let tokenRefreshed = false;
    let tokenPersistFailed = false;
    const tokenErrors = [];

    for (const candidate of candidates) {
      try {
        const tokenString = decryptToken(candidate.encrypted);
        const { accessToken: candidateAccess, refreshToken } = parseToken(tokenString);

        console.log(`    Trying ${candidate.source} token: ${maskToken(tokenString)}`);

        if (!isTokenExpired(tokenString, 300)) { // 5 min buffer
          console.log(`✅ ${candidate.source} access token still valid`);
          accessToken = candidateAccess;
          tokenSource = candidate.source;
          break;
        }

        console.log(`🔄 ${candidate.source} token expired, refreshing...`);
        const newTokens = await osuAPI.refreshUserToken(refreshToken);

        const newExpiresAt = Math.floor(Date.now() / 1000) + newTokens.expires_in;
        const newTokenString = createTokenString(newTokens.access_token, newExpiresAt, newTokens.refresh_token);
        const newEncryptedToken = encryptToken(newTokenString);

        // Persist the rotation back to where the token lives. If this write
        // fails, the room still gets created with the fresh access token,
        // but the old refresh token is burned (osu! already rotated it) —
        // surface that instead of failing silently, otherwise the NEXT
        // schedule 401s with no visible cause.
        const { error: persistError } = candidate.source === 'embedded'
          ? await supabaseAdmin
              .from('scheduled_challenges')
              .update({ encrypted_token: newEncryptedToken })
              .eq('id', scheduleId)
          : await supabaseAdmin
              .from('user_osu_tokens')
              .update({
                encrypted_token: newEncryptedToken,
                updated_at: new Date().toISOString()
              })
              .eq('osu_id', schedule.osu_id);

        if (persistError) {
          console.error(`🚨 Failed to persist rotated ${candidate.source} token:`, persistError);
          tokenPersistFailed = true;
        } else {
          console.log(`✅ ${candidate.source} token refreshed and persisted`);
        }

        accessToken = newTokens.access_token;
        tokenSource = candidate.source;
        tokenRefreshed = true;
        break;

      } catch (tokenError) {
        console.error(`❌ ${candidate.source} token unusable:`, tokenError.message);
        tokenErrors.push(`${candidate.source}: ${tokenError.message}`);
      }
    }

    if (!accessToken) {
      const details = tokenErrors.join('; ');
      console.error('❌ All token candidates failed:', details);

      await supabaseAdmin
        .from('scheduled_challenges')
        .update({
          status: 'failed',
          error_message: `Token refresh failed: ${details}`,
          retry_count: schedule.retry_count + 1,
          executed_at: new Date().toISOString()
        })
        .eq('id', scheduleId);

      return {
        success: false,
        scheduleId,
        error: 'Token refresh failed',
        details
      };
    }

    console.log(`    Using ${tokenSource} token${tokenRefreshed ? ' (refreshed)' : ''}`);

    // Step 3: Verify user is still admin
    console.log('👤 Step 3: Verifying admin status...');
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, osu_id, username, admin')
      .eq('osu_id', schedule.osu_id)
      .single();

    if (userError || !user) {
      console.log('❌ User not found');

      await supabaseAdmin
        .from('scheduled_challenges')
        .update({
          status: 'failed',
          error_message: 'User not found',
          executed_at: new Date().toISOString()
        })
        .eq('id', scheduleId);

      return {
        success: false,
        scheduleId,
        error: 'User not found'
      };
    }

    if (!user.admin) {
      console.log('❌ User no longer has admin privileges');

      await supabaseAdmin
        .from('scheduled_challenges')
        .update({
          status: 'failed',
          error_message: 'User no longer has admin privileges',
          executed_at: new Date().toISOString()
        })
        .eq('id', scheduleId);

      return {
        success: false,
        scheduleId,
        error: 'User not admin'
      };
    }

    console.log(`✅ User ${user.username} is still an admin`);

    // Step 4: Create the room with retry logic
    console.log('🎮 Step 4: Creating multiplayer room...');

    // Clean room_data: remove AT from allowed mods to avoid invalid mod errors
    const cleanedRoomData = {
      ...schedule.room_data,
      playlist: schedule.room_data.playlist?.map(item => {
        if (item.allowed_mods && item.allowed_mods.length > 0) {
          const filteredMods = item.allowed_mods.filter(mod => mod.acronym !== 'AT');
          const removedCount = item.allowed_mods.length - filteredMods.length;
          if (removedCount > 0) {
            console.log(`    Removed AT mod from playlist item ${item.id || 0}`);
          }
          return { ...item, allowed_mods: filteredMods };
        }
        return item;
      })
    };

    let room = null;
    let lastError = null;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`    Attempt ${attempt}/${maxRetries}...`);

        room = await osuAPI.createRoomWithUserToken(
          cleanedRoomData,
          accessToken
        );

        console.log(`✅ Room created successfully: ${room.id}`);
        break;

      } catch (createError) {
        lastError = createError;
        console.error(`❌ Attempt ${attempt} failed:`, createError.message);

        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // 2s, 4s
          console.log(`⏳ Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    if (!room) {
      console.error(`❌ Failed to create room after ${maxRetries} attempts`);

      await supabaseAdmin
        .from('scheduled_challenges')
        .update({
          status: 'failed',
          error_message: `Room creation failed: ${lastError?.message || 'Unknown error'}`,
          retry_count: schedule.retry_count + 1,
          executed_at: new Date().toISOString()
        })
        .eq('id', scheduleId);

      return {
        success: false,
        scheduleId,
        error: 'Room creation failed',
        details: lastError?.message,
        attempts: maxRetries
      };
    }

    // Step 5: Send chat messages (if any)
    let chatSent = true;
    if (schedule.chat_messages && schedule.chat_messages.length > 0) {
      console.log('💬 Step 5: Sending chat messages...');

      try {
        await osuAPI.sendChatToRoom(
          room.id,
          schedule.osu_id,
          schedule.chat_messages,
          accessToken
        );
        console.log('✅ Chat messages sent successfully');
      } catch (chatError) {
        console.error('❌ Failed to send chat messages:', chatError.message);
        chatSent = false;
        // Don't fail the whole operation - room was created successfully
      }
    } else {
      console.log('ℹ️ No chat messages to send');
    }

    // Step 5.5: Immediately add to tracker (Call update-challenge logic)
    console.log('📝 Step 5.5: Initializing tracker for new room...');
    let trackerInitialized = false;
    let challengeId = null;
    try {
      const trackerResult = await triggerImmediateUpdate(room.id);
      trackerInitialized = true;
      // Extract the challenge ID from the tracker result if available
      challengeId = trackerResult?.challenge?.id || null;
      console.log('✅ Tracker initialized successfully', challengeId ? `(Challenge ID: ${challengeId})` : '');
    } catch (trackError) {
      console.error('⚠️ Failed to initialize tracker (non-fatal):', trackError.message);
      // We log but don't fail, as the room exists on osu! now
    }

    // Step 5.6: Ensure challenge has season_id
    let seasonApplied = false;
    if (challengeId) {
      let seasonId = schedule.season_id;

      if (!seasonId) {
        const { data: currentSeasonId } = await supabaseAdmin.rpc('get_current_season_id');
        seasonId = currentSeasonId;
      }

      if (seasonId) {
        await supabaseAdmin
          .from('challenges')
          .update({ season_id: seasonId })
          .eq('id', challengeId);

        console.log(`✅ Set season_id ${seasonId} for challenge ${challengeId}`);
        seasonApplied = true;
      } else {
        console.warn('⚠️ No season_id available (none in schedule, no current season)');
      }
    }

    let rulesetApplied = false;
    if (schedule.ruleset_config && challengeId) {
      console.log('🎯 Step 5.7: Applying ruleset configuration...');

      try {
        rulesetApplied = await applyRulesetConfig(challengeId, schedule.ruleset_config);
        if (rulesetApplied) {
          console.log('✅ Ruleset configuration applied successfully');
        } else {
          console.log('⚠️ Ruleset configuration could not be applied');
        }
      } catch (rulesetError) {
        console.error('⚠️ Failed to apply ruleset (non-fatal):', rulesetError.message);
        // Don't fail the whole operation - room was created successfully
      }
    } else if (schedule.ruleset_config && !challengeId) {
      console.log('⚠️ Cannot apply ruleset: Challenge ID not available from tracker');
    } else {
      console.log('ℹ️ No ruleset configuration to apply');
    }

    // Step 6: Mark as completed
    console.log('✅ Step 6: Marking as completed...');

    // Build error message if any non-fatal issues occurred
    let errorMessage = null;
    const issues = [];
    if (!chatSent) issues.push('Chat messages failed');
    if (schedule.ruleset_config && !rulesetApplied) issues.push('Ruleset configuration failed');
    if (tokenPersistFailed) issues.push('Rotated token could not be saved — next schedule will fail unless the token is re-stored');
    if (issues.length > 0) {
      errorMessage = `${issues.join(', ')} (room created successfully)`;
    }

    await supabaseAdmin
      .from('scheduled_challenges')
      .update({
        status: 'completed',
        created_room_id: room.id,
        error_message: errorMessage,
        executed_at: new Date().toISOString()
      })
      .eq('id', scheduleId);

    console.log(`🎉 Schedule #${scheduleId} completed successfully!`);
    console.log(`    Room ID: ${room.id}`);
    console.log(`    Room URL: https://osu.ppy.sh/multiplayer/rooms/${room.id}`);

    return {
      success: true,
      scheduleId,
      roomId: room.id,
      roomName: room.name,
      chatSent,
      trackerInitialized,
      seasonApplied,
      rulesetApplied,
      tokenRefreshed,
      tokenSource,
      delaySeconds: Math.round(delay / 1000)
    };

  } catch (error) {
    console.error(`🚨 Error processing schedule #${scheduleId}:`, error);

    // Try to mark as failed
    try {
      await supabaseAdmin
        .from('scheduled_challenges')
        .update({
          status: 'failed',
          error_message: error.message || 'Unknown error',
          retry_count: schedule.retry_count + 1,
          executed_at: new Date().toISOString()
        })
        .eq('id', scheduleId);
    } catch (updateError) {
      console.error('Failed to update schedule status:', updateError);
    }

    return {
      success: false,
      scheduleId,
      error: error.message || 'Unknown error'
    };
  }
}

// Helper: Reuse the update-challenge logic via mock request
// This ensures the room is added to the DB with all correct relations (season, scores, etc)
async function triggerImmediateUpdate(roomId) {
  // Dynamic import to allow running in cron context
  const updateChallengeModule = await import('../pages/api/update-challenge');
  const updateHandler = updateChallengeModule.default;

  const mockReq = {
    method: 'POST',
    body: { roomId: parseInt(roomId) },
    headers: { 'x-internal-call': 'true' }
  };

  let responseData = null;
  let responseStatus = 200;

  const mockRes = {
    status: (code) => {
      responseStatus = code;
      return mockRes;
    },
    json: (data) => {
      responseData = data;
      return mockRes;
    },
    setHeader: () => mockRes
  };

  await updateHandler(mockReq, mockRes);

  if (responseStatus >= 400) {
    throw new Error(responseData?.error || 'Update handler returned error status');
  }

  return responseData;
}

/**
 * @param {number} challengeId - The challenge ID to apply ruleset to
 * @param {Object} rulesetConfig - The ruleset configuration
 * @returns {boolean} - True if successfully applied
 */
async function applyRulesetConfig(challengeId, rulesetConfig) {
  if (!rulesetConfig || !rulesetConfig.required_mods || rulesetConfig.required_mods.length === 0) {
    console.log('    No valid ruleset config to apply');
    return false;
  }

  try {
    // Default to 'at_least' if not specified (matching Change 1)
    const matchType = rulesetConfig.ruleset_match_type || 'at_least';

    console.log(`    Applying ruleset: ${matchType} with ${rulesetConfig.required_mods.length} mod(s)`);

    // Update the challenge with ruleset configuration
    const { data: updatedChallenge, error: updateError } = await supabaseAdmin
      .from('challenges')
      .update({
        has_ruleset: true,
        required_mods: rulesetConfig.required_mods,
        ruleset_match_type: matchType,
        updated_at: new Date().toISOString()
      })
      .eq('id', challengeId)
      .select('id, room_id')
      .single();

    if (updateError) {
      console.error('    Failed to update challenge with ruleset:', updateError);
      return false;
    }

    console.log(`    Ruleset applied to challenge ${challengeId} (room ${updatedChallenge.room_id})`);

    // Calculate the ruleset winner
    try {
      const { data: winnerResult, error: winnerError } = await supabaseAdmin
        .rpc('update_challenge_ruleset_winner', { challenge_id_param: challengeId });

      if (winnerError) {
        console.warn('    Winner calculation warning:', winnerError.message);
      } else {
        console.log('    Ruleset winner calculated');
      }
    } catch (winnerCalcError) {
      console.warn('    Winner calculation error (non-fatal):', winnerCalcError.message);
    }

    return true;

  } catch (error) {
    console.error('    Error applying ruleset config:', error);
    return false;
  }
}
