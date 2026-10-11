import { supabase } from './supabase';

export const SUPER_ADMIN_EMAIL = 'emmykul89@gmail.com';

export interface ActivityLog {
  id: string;
  user_id: string | null;
  email: string | null;
  role: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown>;
  status: string;
  created_at: string;
}

export interface AdminRecipient {
  id: string;
  email: string;
  full_name: string | null;
  role: string | null;
}

export interface EmailLog {
  id: string;
  recipient_email: string;
  subject: string;
  status: 'sent' | 'failed';
  error_message: string | null;
  sent_at: string;
}

export const isSuperAdmin = (email?: string | null) =>
  email?.trim().toLowerCase() === SUPER_ADMIN_EMAIL;

export const getCurrentAdminStatus = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user?.email_confirmed_at || !isSuperAdmin(user.email)) return null;

  const { data, error: adminError } = await supabase.rpc('is_super_admin');
  if (adminError) throw adminError;
  return data === true ? user : null;
};

export const logActivity = async (
  action: 'user_login' | 'user_logout',
  userId: string,
) => {
  try {
    const { error } = await supabase.from('activity_logs').insert({
      user_id: userId,
      action,
      details: {},
      status: 'success',
    });
    if (error) {
      console.error('[Activity Log] Failed to record authentication event:', error);
    }
  } catch (error) {
    console.error('[Activity Log] Could not reach Supabase to record authentication event:', error);
  }
};

export const fetchActivityLogs = async (options: {
  limit?: number;
  offset?: number;
  email?: string;
  role?: string;
  action?: string;
  since?: string;
  until?: string;
} = {}): Promise<ActivityLog[]> => {
  const { data, error } = await supabase.rpc('get_super_admin_activity_logs', {
    p_email: options.email?.trim() || null,
    p_role: options.role || null,
    p_action: options.action || null,
    p_since: options.since || null,
    p_until: options.until || null,
    p_limit: options.limit ?? 50,
    p_offset: options.offset ?? 0,
  });
  if (error) throw error;
  return (data || []) as ActivityLog[];
};

export const fetchAdminRecipients = async (options: {
  search?: string;
  role?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<AdminRecipient[]> => {
  const { data, error } = await supabase.rpc('get_super_admin_recipients', {
    p_search: options.search?.trim() || null,
    p_role: options.role || null,
    p_limit: options.limit ?? 30,
    p_offset: options.offset ?? 0,
  });
  if (error) throw error;
  return (data || []) as AdminRecipient[];
};

export const fetchAdminUserCount = async (): Promise<number> => {
  const { data, error } = await supabase.rpc('get_super_admin_user_count');
  if (error) throw error;
  if (typeof data !== 'number' || !Number.isSafeInteger(data) || data < 0) {
    throw new Error('The total user count returned an invalid value.');
  }
  return data;
};

export const fetchEmailLogs = async (limit = 50): Promise<EmailLog[]> => {
  const { data, error } = await supabase
    .from('admin_email_logs')
    .select('id, recipient_email, subject, status, error_message, sent_at')
    .order('sent_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as EmailLog[];
};
