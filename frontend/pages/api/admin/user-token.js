import { supabaseAdmin } from '../../../lib/supabase-admin';
import { validateRequest, handleAPIError, handleAPIResponse } from '../../../lib/api-utils';
import { encryptToken, decryptToken, maskToken, parseToken, isTokenExpired, createTokenString } from '../../../lib/token-encryption';
import { osuAPI } from '../../../lib/osu-api';

const SCHEDULER_SECRET = process.env.SCHEDULER_SHARED_SECRET;

if (!SCHEDULER_SECRET || SCHEDULER_SECRET.length < 32) {
  throw new Error('SCHEDULER_SHARED_SECRET must be set and at least 32 characters');
}

/**
 * Verify scheduler authentication
 */
function verifySchedulerAuth(req) {
  const providedSecret = req.headers['x-scheduler-secret'];
  
  if (!providedSecret) {
    throw new Error('Authentication required');
  }

  if (providedSecret !== SCHEDULER_SECRET) {
    throw new Error('Invalid authentication');
  }
}

export default async function handler(req, res) {
  console.log('User token management:', {
    method: req.method,
    timestamp: new Date().toISOString()
  });

  try {
    // Verify authentication for all requests
    verifySchedulerAuth(req);

    switch (req.method) {
      case 'POST':
        return await handleSetToken(req, res);
      case 'GET':
        return await handleGetTokenStatus(req, res);
      case 'DELETE':
        return await handleRevokeToken(req, res);
      default:
        return res.status(405).json({
          success: false,
          error: 'Method not allowed'
        });
    }
  } catch (error) {
    console.error('🚨 Token management error:', error);
    
    if (error.message === 'Authentication required' || error.message === 'Invalid authentication') {
      return res.status(401).json({
        success: false,
        error: error.message
      });
    }
    
    return handleAPIError(res, error);
  }
}

/**
 * POST - Set/update user's osu! token
 */
async function handleSetToken(req, res) {
  console.log('Setting user token');

  try {
    validateRequest(req, {
      method: 'POST',
      body: {
        osu_id: { required: true, type: 'number' },
        osu_token: { required: true, type: 'string' }
      }
    });

    const { osu_id, osu_token } = req.body;

    console.log(`Token set request from osu_id ${osu_id}`);
    console.log(`Token (masked): ${maskToken(osu_token)}`);

    // Step 1: Verify user exists and is admin
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, osu_id, username, admin')
      .eq('osu_id', osu_id)
      .single();

    if (userError || !user) {
      console.log('❌ User not found:', osu_id);
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (!user.admin) {
      console.log('❌ User is not admin:', user.username);
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    // Step 2: Validate token format and check if it's expired
    try {
      const parsed = parseToken(osu_token);
      console.log(`Token expires at: ${parsed.expiresAt.toISOString()}`);

      if (isTokenExpired(osu_token, 0)) {
        console.log('⚠️ Token is already expired');
        return res.status(400).json({
          success: false,
          error: 'Token is expired. Please provide a valid token.',
          expires_at: parsed.expiresAt.toISOString()
        });
      }
    } catch (parseError) {
      console.error('❌ Invalid token format:', parseError.message);
      return res.status(400).json({
        success: false,
        error: 'Invalid token format. Expected: access_token|timestamp|refresh_token'
      });
    }

    // Step 3: Verify token is valid by making a test API call
    console.log('🔍 Verifying token validity with osu! API...');
    try {
      const { accessToken } = parseToken(osu_token);
      const userInfo = await osuAPI.getUserWithToken(accessToken);
      
      // Verify the token belongs to the user
      if (userInfo.id !== osu_id) {
        console.log('❌ Token user ID mismatch:', {
          expected: osu_id,
          actual: userInfo.id
        });
        return res.status(400).json({
          success: false,
          error: 'Token does not belong to this user',
          token_user_id: userInfo.id,
          expected_user_id: osu_id
        });
      }

      console.log('✅ Token verified for user:', userInfo.username);
    } catch (apiError) {
      console.error('❌ Token verification failed:', apiError.message);
      return res.status(400).json({
        success: false,
        error: 'Failed to verify token with osu! API',
        details: apiError.message
      });
    }

    // Step 4: Encrypt and store token
    console.log('🔐 Encrypting token...');
    const encrypted_token = encryptToken(osu_token);

    // Upsert (insert or update)
    const { data: tokenRecord, error: upsertError } = await supabaseAdmin
      .from('user_osu_tokens')
      .upsert({
        osu_id,
        encrypted_token,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'osu_id'
      })
      .select()
      .single();

    if (upsertError) {
      console.error('❌ Database upsert error:', upsertError);
      throw upsertError;
    }

    console.log('✅ Token stored successfully:', {
      id: tokenRecord.id,
      osu_id: tokenRecord.osu_id
    });

    return handleAPIResponse(res, {
      message: 'Token set successfully',
      user: {
        osu_id: user.osu_id,
        username: user.username
      },
      token_set_at: tokenRecord.updated_at
    }, { cache: false });

  } catch (error) {
    console.error('🚨 Set token error:', error);
    return handleAPIError(res, error);
  }
}

/**
 * GET - Check if user has a token stored
 */
async function handleGetTokenStatus(req, res) {
  console.log('Getting token status');

  try {
    const { osu_id } = req.query;

    if (!osu_id) {
      return res.status(400).json({
        success: false,
        error: 'osu_id query parameter is required'
      });
    }

    const parsedOsuId = parseInt(osu_id);
    if (isNaN(parsedOsuId)) {
      return res.status(400).json({
        success: false,
        error: 'osu_id must be a number'
      });
    }

    console.log(`Checking token status for osu_id: ${parsedOsuId}`);

    // Check if user exists
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('osu_id, username, admin')
      .eq('osu_id', parsedOsuId)
      .single();

    if (userError || !user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if token exists
    const { data: tokenRecord, error: tokenError } = await supabaseAdmin
      .from('user_osu_tokens')
      .select('id, encrypted_token, created_at, updated_at')
      .eq('osu_id', parsedOsuId)
      .single();

    let hasToken = !tokenError && !!tokenRecord;

    // Validate the stored token instead of just reporting row existence.
    // A dead token would otherwise read as "has token" forever, and the
    // scheduler UI would never offer to store a fresh one — leaving the
    // user's schedules failing with refresh 401s with no way to recover.
    let tokenStatus = hasToken ? 'valid' : 'none';
    let tokenSetAt = hasToken ? tokenRecord.updated_at : null;

    if (hasToken) {
      const validation = await validateStoredToken(parsedOsuId, tokenRecord.encrypted_token);
      tokenStatus = validation.status;

      if (validation.status === 'dead') {
        // Refresh token is burned (revoked by a newer osu! login, or expired).
        // Remove the row so the scheduler prompts the user to store a fresh token.
        console.log(`🗑️ Removing dead token for ${user.username}`);
        // Conditional on updated_at: if a concurrent check just rotated the
        // token, don't delete the fresh row our stale refresh 401'd against
        await supabaseAdmin
          .from('user_osu_tokens')
          .delete()
          .eq('osu_id', parsedOsuId)
          .eq('updated_at', tokenRecord.updated_at);

        hasToken = false;
        tokenSetAt = null;
      } else if (validation.status === 'refreshed') {
        tokenSetAt = validation.updatedAt;
      }
      // 'valid' and 'unverified' (transient refresh error) keep the token
    }

    console.log(`Token status for ${user.username}: ${hasToken ? 'HAS TOKEN' : 'NO TOKEN'} (${tokenStatus})`);

    return handleAPIResponse(res, {
      has_token: hasToken,
      token_status: tokenStatus,
      user: {
        osu_id: user.osu_id,
        username: user.username,
        admin: user.admin
      },
      token_set_at: tokenSetAt,
      token_created_at: hasToken ? tokenRecord.created_at : null
    }, { cache: false });

  } catch (error) {
    console.error('🚨 Get token status error:', error);
    return handleAPIError(res, error);
  }
}

/**
 * Validate a stored token, refreshing it if the access token has expired.
 *
 * Returns { status, updatedAt? } where status is:
 *   'valid'      - access token still usable as-is
 *   'refreshed'  - was expired, refresh succeeded, rotated token stored
 *   'dead'       - refresh rejected by osu! (burned refresh token) or token unreadable
 *   'unverified' - expired but refresh failed transiently (network/5xx); kept as-is,
 *                  the cron will surface the truth at execution time
 */
async function validateStoredToken(osuId, encryptedToken) {
  let tokenString;
  let refreshToken;

  try {
    tokenString = decryptToken(encryptedToken);
    ({ refreshToken } = parseToken(tokenString));
  } catch (parseError) {
    console.error('❌ Stored token unreadable:', parseError.message);
    return { status: 'dead' };
  }

  // Access token still valid (5 min buffer) — nothing to do
  if (!isTokenExpired(tokenString, 300)) {
    return { status: 'valid' };
  }

  console.log('🔄 Stored access token expired, attempting refresh to validate...');

  try {
    const newTokens = await osuAPI.refreshUserToken(refreshToken);

    const newExpiresAt = Math.floor(Date.now() / 1000) + newTokens.expires_in;
    const newTokenString = createTokenString(newTokens.access_token, newExpiresAt, newTokens.refresh_token);
    const updatedAt = new Date().toISOString();

    const { error: updateError } = await supabaseAdmin
      .from('user_osu_tokens')
      .update({
        encrypted_token: encryptToken(newTokenString),
        updated_at: updatedAt
      })
      .eq('osu_id', osuId);

    if (updateError) {
      // Rotated token not persisted — the stored one is now burned.
      // Report dead so the user re-stores rather than silently failing later.
      console.error('❌ Failed to persist refreshed token:', updateError);
      return { status: 'dead' };
    }

    console.log('✅ Stored token refreshed and rotated');
    return { status: 'refreshed', updatedAt };

  } catch (refreshError) {
    // osu! rejects burned/invalid refresh tokens with 400/401;
    // anything else (network, 5xx) is transient — don't delete on those
    const statusMatch = refreshError.message?.match(/:\s*(\d{3})$/);
    const httpStatus = statusMatch ? parseInt(statusMatch[1]) : null;

    if (httpStatus === 400 || httpStatus === 401) {
      console.log(`❌ Refresh token rejected (${httpStatus}) — token is dead`);
      return { status: 'dead' };
    }

    console.warn('⚠️ Token refresh failed transiently, keeping stored token:', refreshError.message);
    return { status: 'unverified' };
  }
}

/**
 * DELETE - Revoke/remove user's stored token
 */
async function handleRevokeToken(req, res) {
  console.log('Revoking user token');

  try {
    validateRequest(req, {
      method: 'DELETE',
      body: {
        osu_id: { required: true, type: 'number' }
      }
    });

    const { osu_id } = req.body;

    console.log(`Token revoke request from osu_id: ${osu_id}`);

    // Verify user exists
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('osu_id, username')
      .eq('osu_id', osu_id)
      .single();

    if (userError || !user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Delete token
    const { error: deleteError } = await supabaseAdmin
      .from('user_osu_tokens')
      .delete()
      .eq('osu_id', osu_id);

    if (deleteError) {
      console.error('❌ Database delete error:', deleteError);
      throw deleteError;
    }

    console.log('✅ Token revoked for user:', user.username);

    return handleAPIResponse(res, {
      message: 'Token revoked successfully',
      user: {
        osu_id: user.osu_id,
        username: user.username
      }
    }, { cache: false });

  } catch (error) {
    console.error('🚨 Revoke token error:', error);
    return handleAPIError(res, error);
  }
}