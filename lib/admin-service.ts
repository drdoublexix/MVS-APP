import { supabase } from './supabase';

export const sendAdminEmail = async (recipientUserId: string, subject: string, body: string) => {
  const { data, error } = await supabase.functions.invoke('admin-send-email', {
    body: {
      recipient_user_id: recipientUserId,
      subject,
      body,
    },
  });

  if (error) throw error;
  if (!data?.success) {
    throw new Error(data?.error || 'The email could not be sent.');
  }
  return data as { success: true; recipient: string; auditWarning?: string };
};
