import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Layout from '../../components/Layout';
import { 
  Loader2, Calendar, Clock, ChevronLeft, ChevronRight, X, Eye, 
  CheckCircle, AlertCircle, XCircle, Pause, Play, Trash2, Edit2,
  Save, RotateCcw, ExternalLink, Target, Music, MessageSquare
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { useRouter } from 'next/router';

export default function AdminScheduledChallenges() {
  const { user, loading: authLoading, isAdmin } = useAuth();
  const router = useRouter();
  
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({});
  const [result, setResult] = useState(null);
  
  // Filters
  const [filters, setFilters] = useState({
    status: 'pending',
    limit: 25,
    offset: 0
  });
  
  // Edit modal state
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  
  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Retry confirmation (failed schedules)
  const [retryConfirm, setRetryConfirm] = useState(null);
  const [retryingId, setRetryingId] = useState(null);

  // Load schedules
  const loadSchedules = useCallback(async () => {
    setLoading(true);
    
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== '' && value !== null && value !== undefined) {
          params.append(key, value.toString());
        }
      });

      const response = await fetch(`/api/admin/schedules?${params}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to load schedules');
      }

      const data = await response.json();
      
      if (data.success) {
        setSchedules(data.data?.schedules || data.schedules || []);
        setPagination(data.data?.pagination || data.pagination || {});
      } else {
        throw new Error(data.error || 'Failed to load schedules');
      }
    } catch (error) {
      console.error('Error loading schedules:', error);
      setResult({
        success: false,
        error: error.message
      });
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Auth check
  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/');
        return;
      }
      if (!isAdmin) {
        router.push('/admin');
        return;
      }
    }
  }, [user, authLoading, isAdmin, router]);

  // Load on filter change
  useEffect(() => {
    if (user && isAdmin && !authLoading) {
      loadSchedules();
    }
  }, [user, isAdmin, authLoading, loadSchedules]);

  const updateFilters = (newFilters) => {
    setFilters(prev => ({
      ...prev,
      ...newFilters,
      offset: 0
    }));
  };

  const changePage = (newOffset) => {
    setFilters(prev => ({ ...prev, offset: newOffset }));
  };

  // Cancel a schedule
  const handleCancel = async (schedule) => {
    if (!deleteConfirm || deleteConfirm.id !== schedule.id) {
      setDeleteConfirm(schedule);
      return;
    }

    setDeleting(true);
    
    try {
      const response = await fetch('/api/admin/schedules', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: schedule.id })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setResult({
          success: true,
          message: 'Schedule cancelled successfully'
        });
        setDeleteConfirm(null);
        loadSchedules();
      } else {
        throw new Error(data.error || 'Failed to cancel schedule');
      }
    } catch (error) {
      console.error('Error cancelling schedule:', error);
      setResult({
        success: false,
        error: error.message
      });
    } finally {
      setDeleting(false);
    }
  };

  // Retry a failed schedule — recreates the room on osu! immediately
  const handleRetry = async (schedule) => {
    if (!retryConfirm || retryConfirm.id !== schedule.id) {
      setRetryConfirm(schedule);
      return;
    }

    setRetryConfirm(null);
    setRetryingId(schedule.id);

    try {
      const response = await fetch('/api/admin/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: schedule.id })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        const roomId = data.data?.room_id || data.room_id;
        setResult({
          success: true,
          message: `Room created successfully!${roomId ? ` Room #${roomId}` : ''}`
        });
      } else {
        throw new Error(data.error || 'Retry failed');
      }
    } catch (error) {
      console.error('Error retrying schedule:', error);
      setResult({
        success: false,
        error: `Retry failed: ${error.message}`
      });
    } finally {
      setRetryingId(null);
      loadSchedules(); // reflect new status / error message either way
    }
  };

  // Helper: Convert UTC date string to local datetime-local input value
  const utcToLocalInput = (utcDateString) => {
    const date = new Date(utcDateString);
    // Get local ISO string by adjusting for timezone offset
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - offset * 60 * 1000);
    return localDate.toISOString().slice(0, 16);
  };

  // Helper: Convert local datetime-local input value to UTC ISO string
  const localInputToUtc = (localDateString) => {
    // The input value is in local time, so we just create a date and convert to ISO
    return new Date(localDateString).toISOString();
  };

  // Open edit modal
  const handleEdit = (schedule) => {
    setEditingSchedule(schedule);
    setEditForm({
      scheduled_time: utcToLocalInput(schedule.scheduled_time),
      room_name: schedule.room_data?.name || '',
      chat_messages: schedule.chat_messages?.join('\n') || '',
      // Ruleset config
      has_ruleset: !!schedule.ruleset_config,
      ruleset_match_type: schedule.ruleset_config?.ruleset_match_type || 'at_least',
      required_mods_display: schedule.ruleset_config?.required_mods?.map(m => m.acronym).join(', ') || ''
    });
  };

  // Save edit
  const handleSaveEdit = async () => {
    if (!editingSchedule) return;
    
    setSaving(true);
    
    try {
      const updates = {
        id: editingSchedule.id
      };

      // Only include changed fields - convert local input back to UTC
      const newScheduledTime = localInputToUtc(editForm.scheduled_time);
      if (newScheduledTime !== editingSchedule.scheduled_time) {
        updates.scheduled_time = newScheduledTime;
      }

      // Update room name if changed
      if (editForm.room_name !== editingSchedule.room_data?.name) {
        updates.room_data = {
          ...editingSchedule.room_data,
          name: editForm.room_name
        };
      }

      // Update chat messages if changed
      const newChatMessages = editForm.chat_messages.split('\n').filter(m => m.trim());
      if (JSON.stringify(newChatMessages) !== JSON.stringify(editingSchedule.chat_messages)) {
        updates.chat_messages = newChatMessages;
      }

      const response = await fetch('/api/admin/schedules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates)
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setResult({
          success: true,
          message: 'Schedule updated successfully'
        });
        setEditingSchedule(null);
        loadSchedules();
      } else {
        throw new Error(data.error || 'Failed to update schedule');
      }
    } catch (error) {
      console.error('Error updating schedule:', error);
      setResult({
        success: false,
        error: error.message
      });
    } finally {
      setSaving(false);
    }
  };

  // Format date for display
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get time until scheduled
  const getTimeUntil = (dateString) => {
    const now = new Date();
    const scheduled = new Date(dateString);
    const diff = scheduled - now;
    
    if (diff < 0) return 'Overdue';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    return `${hours}h ${minutes}m`;
  };

  // Status badge
  const getStatusBadge = (status) => {
    const badges = {
      pending: { color: 'bg-yellow-100 text-yellow-800', icon: Clock, label: 'Pending' },
      completed: { color: 'bg-green-100 text-green-800', icon: CheckCircle, label: 'Completed' },
      failed: { color: 'bg-red-100 text-red-800', icon: XCircle, label: 'Failed' },
      cancelled: { color: 'bg-gray-100 text-gray-800', icon: Pause, label: 'Cancelled' }
    };
    
    const badge = badges[status] || badges.pending;
    const Icon = badge.icon;
    
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
        <Icon className="w-3 h-3" />
        {badge.label}
      </span>
    );
  };

  // Loading state
  if (authLoading) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-8 flex items-center justify-center">
          <div className="glass-card-enhanced rounded-2xl p-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500 mx-auto" />
            <p className="text-neutral-600 mt-4 text-center">Checking admin access...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!user || !isAdmin) {
    return null;
  }

  return (
    <Layout>
      <div className="min-h-screen py-8">
        <div className="max-w-7xl mx-auto px-4">
          {/* Header - matching admin panel style */}
          <div className="mb-12">
            <div className="flex items-start justify-between mb-8">
              <div>
                <div className="flex items-center gap-4 mb-4">
                  <Link href="/admin" className="text-primary-600 hover:text-primary-700 transition-colors">
                    <ChevronLeft className="w-8 h-8 icon-adaptive-shadow" />
                  </Link>
                  
                  <div className="relative">
                    <Calendar className="w-10 h-10 text-primary-600 icon-adaptive-shadow" />
                  </div>
                  
                  {/* Header with adaptive text shadow */}
                  <h1 
                    className="text-4xl font-bold text-neutral-800 text-white/90 text-adaptive-shadow"
                    data-text="Scheduled Challenges"
                  >
                    Scheduled Challenges
                  </h1>
                </div>
                
                {/* Description */}
                <p className="text-neutral-600 text-lg max-w-3xl text-white/85 text-adaptive-shadow">
                  View and manage scheduled challenge creations. Cancel or edit pending schedules before they execute.
                </p>
              </div>
            </div>
          </div>

          {/* Filters - matching admin panel style */}
          <div className="glass-card-enhanced rounded-2xl p-6 mb-6 border border-neutral-200/60 bg-gradient-to-br from-white/80 to-neutral-50/80 backdrop-blur-lg">
            <div className="flex flex-wrap gap-4 items-end justify-between">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">Status</label>
                <select
                  value={filters.status}
                  onChange={(e) => updateFilters({ status: e.target.value })}
                  className="px-4 py-2.5 border border-neutral-300/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500 bg-white/80 backdrop-blur-sm transition-all"
                >
                  <option value="">All</option>
                  <option value="pending">Pending</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              
              <button
                onClick={loadSchedules}
                className="flex items-center gap-2 bg-gradient-to-r from-primary-600 to-blue-600 hover:from-primary-700 hover:to-blue-700 text-white px-5 py-2.5 rounded-xl font-medium transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                <RotateCcw className="w-4 h-4" />
                Refresh
              </button>
            </div>
          </div>

        {/* Results notification */}
        {result && (
          <div className={`mb-6 p-4 rounded-lg flex items-start gap-3 ${
            result.success 
              ? 'bg-green-50 border border-green-200' 
              : 'bg-red-50 border border-red-200'
          }`}>
            {result.success ? (
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p className={result.success ? 'text-green-800' : 'text-red-800'}>
                {result.message || result.error}
              </p>
            </div>
            <button onClick={() => setResult(null)} className="text-neutral-400 hover:text-neutral-600">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Table - matching admin panel style */}
        <div className="glass-card-enhanced rounded-2xl border border-neutral-200/60 bg-white/80 backdrop-blur-lg overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
            </div>
          ) : schedules.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-neutral-300 to-neutral-400 rounded-2xl flex items-center justify-center">
                <Calendar className="w-8 h-8 text-white" />
              </div>
              <p className="text-neutral-600 font-medium mb-2">No scheduled challenges found</p>
              <p className="text-sm text-neutral-500">Schedules created from the playlist scheduler will appear here.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase">ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Room Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Scheduled For</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Details</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-neutral-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {schedules.map((schedule) => (
                      <tr key={schedule.id} className="hover:bg-neutral-50 transition-colors">
                        <td className="px-6 py-4 text-sm font-mono text-neutral-600">
                          #{schedule.id}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-neutral-800">
                            {schedule.room_data?.name || 'Unnamed'}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-sm text-neutral-500">
                            <span className="flex items-center gap-1">
                              <Music className="w-3 h-3" />
                              {schedule.room_data?.playlist?.length || 0} maps
                            </span>
                            {schedule.chat_messages?.length > 0 && (
                              <span className="flex items-center gap-1">
                                <MessageSquare className="w-3 h-3" />
                                {schedule.chat_messages.length} msgs
                              </span>
                            )}
                            {schedule.ruleset_config && (
                              <span className="flex items-center gap-1 text-yellow-600">
                                <Target className="w-3 h-3" />
                                Ruleset
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-neutral-800">
                            {formatDate(schedule.scheduled_time)}
                          </div>
                          {schedule.status === 'pending' && (
                            <div className="text-xs text-neutral-500 mt-1">
                              In {getTimeUntil(schedule.scheduled_time)}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {getStatusBadge(schedule.status)}
                          {schedule.error_message && (
                            <div className="text-xs text-red-600 mt-1 max-w-xs truncate" title={schedule.error_message}>
                              {schedule.error_message}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {schedule.created_room_id && (
                            <a
                              href={`https://osu.ppy.sh/multiplayer/rooms/${schedule.created_room_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-primary-600 hover:text-primary-700"
                            >
                              Room #{schedule.created_room_id}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                          {schedule.executed_at && (
                            <div className="text-xs text-neutral-500 mt-1">
                              Executed: {formatDate(schedule.executed_at)}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2">
                            {schedule.status === 'pending' && (
                              <>
                                <button
                                  onClick={() => handleEdit(schedule)}
                                  className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
                                  title="Edit schedule"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleCancel(schedule)}
                                  className={`p-2 rounded-md transition-colors ${
                                    deleteConfirm?.id === schedule.id
                                      ? 'bg-red-500 text-white hover:bg-red-600'
                                      : 'text-red-500 hover:text-red-700 hover:bg-red-50'
                                  }`}
                                  title={deleteConfirm?.id === schedule.id ? 'Click again to confirm' : 'Cancel schedule'}
                                  disabled={deleting}
                                >
                                  {deleting && deleteConfirm?.id === schedule.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-4 h-4" />
                                  )}
                                </button>
                              </>
                            )}
                            {schedule.status === 'failed' && (
                              <button
                                onClick={() => handleRetry(schedule)}
                                className={`p-2 rounded-md transition-colors ${
                                  retryConfirm?.id === schedule.id
                                    ? 'bg-green-500 text-white hover:bg-green-600'
                                    : 'text-green-600 hover:text-green-700 hover:bg-green-50'
                                }`}
                                title={retryConfirm?.id === schedule.id ? 'Click again to recreate the room now' : 'Retry — recreate this room now'}
                                disabled={retryingId !== null}
                              >
                                {retryingId === schedule.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <RotateCcw className="w-4 h-4" />
                                )}
                              </button>
                            )}
                            {schedule.created_room_id && (
                              <Link href={`/challenges/${schedule.created_room_id}`}>
                                <button
                                  className="p-2 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50 rounded-md transition-colors"
                                  title="View challenge"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pagination.total > pagination.limit && (
                <div className="px-6 py-4 border-t border-neutral-200">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-neutral-700">
                      Showing {pagination.offset + 1} to {Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => changePage(Math.max(0, pagination.offset - pagination.limit))}
                        disabled={!pagination.hasPrev}
                        className="px-3 py-2 border border-neutral-300 rounded-md text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Previous
                      </button>
                      <button
                        onClick={() => changePage(pagination.offset + pagination.limit)}
                        disabled={!pagination.hasNext}
                        className="px-3 py-2 border border-neutral-300 rounded-md text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        Next
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Edit Modal */}
        {editingSchedule && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-lg w-full p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-neutral-800">Edit Schedule #{editingSchedule.id}</h2>
                <button
                  onClick={() => setEditingSchedule(null)}
                  className="text-neutral-400 hover:text-neutral-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Scheduled Time
                  </label>
                  <input
                    type="datetime-local"
                    value={editForm.scheduled_time}
                    onChange={(e) => setEditForm(prev => ({ ...prev, scheduled_time: e.target.value }))}
                    className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Room Name
                  </label>
                  <input
                    type="text"
                    value={editForm.room_name}
                    onChange={(e) => setEditForm(prev => ({ ...prev, room_name: e.target.value }))}
                    className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Chat Messages (one per line)
                  </label>
                  <textarea
                    value={editForm.chat_messages}
                    onChange={(e) => setEditForm(prev => ({ ...prev, chat_messages: e.target.value }))}
                    rows={4}
                    className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Enter chat messages, one per line..."
                  />
                </div>

                {editForm.has_ruleset && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-yellow-800 font-medium mb-2">
                      <Target className="w-4 h-4" />
                      Ruleset Configuration
                    </div>
                    <div className="text-sm text-yellow-700">
                      <p><strong>Match Type:</strong> {editForm.ruleset_match_type}</p>
                      <p><strong>Required Mods:</strong> {editForm.required_mods_display || 'None'}</p>
                    </div>
                    <p className="text-xs text-yellow-600 mt-2">
                      Note: Ruleset configuration cannot be edited here. Cancel and recreate if needed.
                    </p>
                  </div>
                )}

                <div className="bg-neutral-50 rounded-lg p-4">
                  <h4 className="font-medium text-neutral-700 mb-2">Playlist Preview</h4>
                  <div className="text-sm text-neutral-600">
                    {editingSchedule.room_data?.playlist?.length || 0} beatmaps configured
                  </div>
                  <p className="text-xs text-neutral-500 mt-1">
                    Playlist cannot be edited. Cancel and recreate if needed.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-neutral-200">
                <button
                  onClick={() => setEditingSchedule(null)}
                  disabled={saving}
                  className="px-4 py-2 text-neutral-700 border border-neutral-300 rounded-lg hover:bg-neutral-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cancel Confirmation Toast */}
        {deleteConfirm && (
          <div className="fixed bottom-4 right-4 bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 z-40">
            <AlertCircle className="w-5 h-5" />
            <span>Click cancel button again to confirm</span>
            <button
              onClick={() => setDeleteConfirm(null)}
              className="text-red-200 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Retry Confirmation Toast */}
        {retryConfirm && (
          <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 z-40">
            <AlertCircle className="w-5 h-5" />
            <span>Click retry again to recreate &quot;{retryConfirm.room_data?.name || 'this room'}&quot; on osu! now</span>
            <button
              onClick={() => setRetryConfirm(null)}
              className="text-green-200 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Retry In Progress Toast */}
        {retryingId && (
          <div className="fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 z-40">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Creating room... this can take up to a minute</span>
          </div>
        )}
        </div>
      </div>
    </Layout>
  );
}