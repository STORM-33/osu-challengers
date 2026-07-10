import { supabaseAdmin } from '../../../lib/supabase-admin';
import { processSchedule } from '../../../lib/schedule-processor';
import { handleAPIError } from '../../../lib/api-utils';

const CRON_SECRET = process.env.CRON_SECRET;
const GRACE_PERIOD_MINUTES = 100; // How late we'll still execute

if (!CRON_SECRET) {
  throw new Error('CRON_SECRET must be set in environment');
}

export default async function handler(req, res) {
  const startTime = Date.now();

  console.log('⏰ === SCHEDULED CHALLENGES CRON START ===');
  console.log('📅 Time:', new Date().toISOString());

  // Verify cron secret - support multiple authentication methods
  const authHeader = req.headers.authorization;
  const cronSecret = req.headers['x-cron-secret'];
  const providedSecret = authHeader?.replace('Bearer ', '');

  // Check both Bearer token and custom header
  const isAuthorized =
    (providedSecret && providedSecret === CRON_SECRET) ||
    (cronSecret && cronSecret === CRON_SECRET);

  if (!isAuthorized) {
    console.log('❌ Unauthorized cron request', {
      hasAuth: !!authHeader,
      hasCronSecret: !!cronSecret,
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      userAgent: req.headers['user-agent']
    });
    return res.status(401).json({
      success: false,
      error: 'Unauthorized'
    });
  }

  try {
    // Get all pending schedules that are due
    const now = new Date();
    const gracePeriodAgo = new Date(now.getTime() - GRACE_PERIOD_MINUTES * 60 * 1000);

    console.log('🔍 Looking for pending schedules...');
    console.log(`    Due between: ${gracePeriodAgo.toISOString()} and ${now.toISOString()}`);

    const { data: schedules, error: fetchError } = await supabaseAdmin
      .from('scheduled_challenges')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_time', now.toISOString())
      .gte('scheduled_time', gracePeriodAgo.toISOString())
      .order('scheduled_time', { ascending: true });

    if (fetchError) {
      throw fetchError;
    }

    console.log(`📊 Found ${schedules?.length || 0} pending schedules to process`);

    if (!schedules || schedules.length === 0) {
      const duration = Date.now() - startTime;
      console.log(`✅ No schedules to process (${duration}ms)`);
      return res.status(200).json({
        success: true,
        message: 'No schedules to process',
        processed: 0,
        duration: duration
      });
    }

    // Process each schedule (logic shared with the admin retry endpoint)
    const results = [];

    for (const schedule of schedules) {
      const result = await processSchedule(schedule);
      results.push(result);
    }

    // Summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const duration = Date.now() - startTime;

    console.log('📊 Processing summary:', {
      total: results.length,
      successful,
      failed,
      duration: `${duration}ms`
    });

    console.log('⏰ === SCHEDULED CHALLENGES CRON END ===\n');

    return res.status(200).json({
      success: true,
      message: `Processed ${results.length} schedules`,
      summary: {
        total: results.length,
        successful,
        failed
      },
      results,
      duration
    });

  } catch (error) {
    console.error('🚨 Cron job error:', error);
    console.log('⏰ === SCHEDULED CHALLENGES CRON END (ERROR) ===\n');
    return handleAPIError(res, error);
  }
}
