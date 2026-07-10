import { supabaseAdmin } from '../../../lib/supabase-admin';
import { withAdminAuth } from '../../../lib/auth-middleware';
import { processSchedule } from '../../../lib/schedule-processor';
import { validateRequest, handleAPIError, handleAPIResponse } from '../../../lib/api-utils';

// Retrying a failed schedule (POST) creates the room synchronously:
// up to 3 osu! API attempts with backoff, plus tracker init
export const config = {
  maxDuration: 60
};

/**
 * Admin API for viewing and managing scheduled challenges
 * This wraps the scheduler API with admin authentication
 */
async function handler(req, res) {
  console.log('Admin scheduled challenges API:', {
    method: req.method,
    timestamp: new Date().toISOString()
  });

  switch (req.method) {
    case 'GET':
      return withAdminAuth(handleList)(req, res);
    case 'POST':
      return withAdminAuth(handleRetry)(req, res);
    case 'PATCH':
      return withAdminAuth(handleUpdate)(req, res);
    case 'DELETE':
      return withAdminAuth(handleCancel)(req, res);
    default:
      return res.status(405).json({
        success: false,
        error: 'Method not allowed'
      });
  }
}

/**
 * GET - List scheduled challenges (admin can see all)
 */
async function handleList(req, res) {
  console.log('Admin listing scheduled challenges');

  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let query = supabaseAdmin
      .from('scheduled_challenges')
      .select(`
        id,
        osu_id,
        scheduled_time,
        room_data,
        chat_messages,
        ruleset_config,
        status,
        created_room_id,
        error_message,
        retry_count,
        created_at,
        updated_at,
        executed_at,
        season_id
      `, { count: 'exact' });

    // Filter by status if provided
    if (status) {
      query = query.eq('status', status);
    }

    // Order by scheduled_time (upcoming first for pending, recent first for others)
    if (status === 'pending') {
      query = query.order('scheduled_time', { ascending: true });
    } else {
      query = query.order('scheduled_time', { ascending: false });
    }

    // Pagination
    const parsedLimit = Math.min(parseInt(limit) || 50, 100);
    const parsedOffset = parseInt(offset) || 0;
    
    query = query.range(parsedOffset, parsedOffset + parsedLimit - 1);

    const { data: schedules, error, count } = await query;

    if (error) {
      throw error;
    }

    // Get user info for each schedule
    const osuIds = [...new Set(schedules.map(s => s.osu_id))];
    let userMap = {};
    
    if (osuIds.length > 0) {
      const { data: users } = await supabaseAdmin
        .from('users')
        .select('osu_id, username, avatar_url')
        .in('osu_id', osuIds);
      
      if (users) {
        userMap = Object.fromEntries(users.map(u => [u.osu_id, u]));
      }
    }

    // Enrich schedules with user info
    const enrichedSchedules = schedules.map(schedule => ({
      ...schedule,
      user: userMap[schedule.osu_id] || { username: `User ${schedule.osu_id}` }
    }));

    console.log(`✅ Admin found ${schedules?.length || 0} schedules (total: ${count})`);

    return handleAPIResponse(res, {
      schedules: enrichedSchedules,
      pagination: {
        total: count || 0,
        limit: parsedLimit,
        offset: parsedOffset,
        hasNext: (parsedOffset + parsedLimit) < (count || 0),
        hasPrev: parsedOffset > 0
      }
    }, { cache: false });

  } catch (error) {
    console.error('🚨 Admin list schedules error:', error);
    return handleAPIError(res, error);
  }
}

/**
 * POST - Retry a failed scheduled challenge (recreates the room immediately)
 * Runs the same pipeline as the cron, using the original owner's stored token.
 * Any admin can trigger it, matching this page's edit/cancel permissions.
 */
async function handleRetry(req, res) {
  console.log('Admin retrying scheduled challenge');

  try {
    validateRequest(req, {
      method: 'POST',
      body: {
        id: { required: true, type: 'number' }
      }
    });

    const { id } = req.body;

    // Fetch the full row — processSchedule needs everything
    const { data: schedule, error: fetchError } = await supabaseAdmin
      .from('scheduled_challenges')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !schedule) {
      return res.status(404).json({
        success: false,
        error: 'Schedule not found'
      });
    }

    if (schedule.status !== 'failed') {
      return res.status(400).json({
        success: false,
        error: `Only failed schedules can be retried (status: '${schedule.status}')`
      });
    }

    // If the room had an absolute end time that already passed, osu! would
    // reject the room — fail early with a readable message instead
    const endsAt = schedule.room_data?.ends_at;
    if (endsAt && new Date(endsAt) <= new Date()) {
      return res.status(400).json({
        success: false,
        error: `This room's end time (${new Date(endsAt).toLocaleString('en-US', { timeZone: 'UTC' })} UTC) has already passed. Schedule a new challenge instead.`,
        code: 'ENDS_AT_PASSED'
      });
    }

    // Atomically flip failed -> pending so concurrent retries can't both run
    // (processSchedule only proceeds on status 'pending')
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from('scheduled_challenges')
      .update({
        status: 'pending',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('status', 'failed')
      .select('*')
      .single();

    if (claimError || !claimed) {
      return res.status(409).json({
        success: false,
        error: 'Schedule is already being retried'
      });
    }

    console.log(`🔁 Admin ${req.user.username} retrying schedule #${id} (owner osu_id ${claimed.osu_id}, retry_count ${claimed.retry_count})`);

    // Token preference (stored first, embedded fallback) is handled inside
    // processSchedule
    const result = await processSchedule(claimed);

    if (!result.success) {
      // processSchedule already marked the row failed with the fresh error
      console.log(`❌ Retry of schedule #${id} failed:`, result.error);
      return res.status(502).json({
        success: false,
        error: result.details || result.error || 'Retry failed',
        result
      });
    }

    console.log(`✅ Retry of schedule #${id} succeeded: room ${result.roomId}`);

    return handleAPIResponse(res, {
      message: 'Schedule retried successfully',
      room_id: result.roomId,
      room_url: `https://osu.ppy.sh/multiplayer/rooms/${result.roomId}`,
      result
    }, { cache: false });

  } catch (error) {
    console.error('🚨 Admin retry schedule error:', error);
    return handleAPIError(res, error);
  }
}

/**
 * PATCH - Update a scheduled challenge (only if status='pending')
 */
async function handleUpdate(req, res) {
  console.log('Admin updating scheduled challenge');

  try {
    validateRequest(req, {
      method: 'PATCH',
      body: {
        id: { required: true, type: 'number' },
        scheduled_time: { required: false, type: 'string' },
        room_data: { required: false, type: 'object' },
        chat_messages: { required: false, type: 'array' }
      }
    });

    const { id, ...updates } = req.body;

    // Check if schedule exists and is pending
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('scheduled_challenges')
      .select('id, status, scheduled_time, osu_id, room_data')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({
        success: false,
        error: 'Schedule not found'
      });
    }

    if (existing.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Cannot update schedule with status '${existing.status}'`
      });
    }

    // If updating scheduled_time, ensure it's in the future
    if (updates.scheduled_time) {
      const newScheduledDate = new Date(updates.scheduled_time);
      if (newScheduledDate <= new Date()) {
        return res.status(400).json({
          success: false,
          error: 'Scheduled time must be in the future'
        });
      }
      updates.scheduled_time = newScheduledDate.toISOString();
    }

    // Update
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('scheduled_challenges')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    console.log(`✅ Admin ${req.user.username} updated schedule ${id}`);

    // Remove encrypted token from response
    const { encrypted_token: _, ...scheduleWithoutToken } = updated;

    return handleAPIResponse(res, {
      message: 'Schedule updated successfully',
      schedule: scheduleWithoutToken
    }, { cache: false });

  } catch (error) {
    console.error('🚨 Admin update schedule error:', error);
    return handleAPIError(res, error);
  }
}

/**
 * DELETE - Cancel a scheduled challenge (only if status='pending')
 */
async function handleCancel(req, res) {
  console.log('Admin cancelling scheduled challenge');

  try {
    validateRequest(req, {
      method: 'DELETE',
      body: {
        id: { required: true, type: 'number' }
      }
    });

    const { id } = req.body;

    // Check if schedule exists and is pending
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('scheduled_challenges')
      .select('id, status, room_data, osu_id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({
        success: false,
        error: 'Schedule not found'
      });
    }

    if (existing.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Cannot cancel schedule with status '${existing.status}'`
      });
    }

    // Mark as cancelled
    const { error: updateError } = await supabaseAdmin
      .from('scheduled_challenges')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) {
      throw updateError;
    }

    console.log(`✅ Admin ${req.user.username} cancelled schedule ${id}:`, {
      room_name: existing.room_data?.name,
      original_owner: existing.osu_id
    });

    return handleAPIResponse(res, {
      message: 'Schedule cancelled successfully',
      id
    }, { cache: false });

  } catch (error) {
    console.error('🚨 Admin cancel schedule error:', error);
    return handleAPIError(res, error);
  }
}

export default handler;