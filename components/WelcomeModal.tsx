import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { getCurrentUser, supabase } from '../lib/supabase';

type WelcomeProfile = {
  role?: string | null;
  has_seen_welcome?: boolean | null;
};

const getProfileRoute = (role?: string | null) => {
  switch (role) {
    case 'vet':
      return '/(vet)/profile';
    case 'merchant':
      return '/(merchant)/profile';
    case 'client':
    default:
      return '/(client)/profile';
  }
};

const getWelcomeCopy = (role?: string | null) => {
  switch (role) {
    case 'vet':
      return "Welcome, Doctor! To enable full functionality and seamless payments, please update your practice information and bank account details via the \"Edit Profile\" & \"Bank account\" section.";
    case 'merchant':
      return 'Welcome! To enable full functionality and seamless payments, please update your business information and bank account details via the \"Edit Profile\" & \"Bank account\" section.';
    case 'client':
    default:
      return 'Welcome Critter custodian! To enable full functionality and personalized animal care, please complete your profile information and update your phone number in the "Edit Profile" section.\n\nAlso don\'t forget to add your pets and farm records, on your profile page to keep track of their health journey! Enjoy 🎉';
  }
};

export default function WelcomeModal() {
  const router = useRouter();
  const [profile, setProfile] = useState<WelcomeProfile | null>(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const fetchProfile = async () => {
      try {
        const user = await getCurrentUser();
        if (!user?.id) {
          if (active) setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('role, has_seen_welcome')
          .eq('id', user.id)
          .maybeSingle();

        if (!active) return;

        if (error) {
          console.warn('[WelcomeModal] Failed to load profile:', error);
          setVisible(false);
          setLoading(false);
          return;
        }

        const nextProfile = data || { role: user.user_metadata?.role || 'client', has_seen_welcome: false };
        setProfile(nextProfile);
        setVisible(nextProfile.has_seen_welcome === false || nextProfile.has_seen_welcome === null || nextProfile.has_seen_welcome === undefined);
      } catch (error) {
        console.warn('[WelcomeModal] Unable to check onboarding state:', error);
        if (active) setVisible(false);
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchProfile();
    return () => {
      active = false;
    };
  }, []);

  const markWelcomeSeen = async () => {
    try {
      const user = await getCurrentUser();
      if (user?.id) {
        const { error } = await supabase.from('profiles').update({ has_seen_welcome: true }).eq('id', user.id);
        if (error) {
          console.warn('[WelcomeModal] Failed to persist onboarding state:', error);
        }
      }
    } catch (error) {
      console.warn('[WelcomeModal] Failed to update onboarding flag:', error);
    }
  };

  const handleContinue = async () => {
    await markWelcomeSeen();
    setVisible(false);
    const route = getProfileRoute(profile?.role);
    router.push(route as Parameters<typeof router.push>[0]);
  };

  const handleDismiss = async () => {
    await markWelcomeSeen();
    setVisible(false);
  };

  if (loading || !visible || !profile) return null;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={handleDismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <MaterialCommunityIcons name="account-heart-outline" size={28} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>Welcome to MVS</Text>
          <Text style={styles.message}>{getWelcomeCopy(profile.role)}</Text>

          <Pressable style={styles.primaryButton} onPress={() => { void handleContinue(); }}>
            <Text style={styles.primaryButtonText}>Go to Profile</Text>
          </Pressable>

          <Pressable style={styles.secondaryButton} onPress={() => { void handleDismiss(); }}>
            <Text style={styles.secondaryButtonText}>Remind me later</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#111827',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
  },
  message: {
    color: '#E2E8F0',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 22,
  },
  primaryButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryButton: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#475569',
    backgroundColor: 'transparent',
  },
  secondaryButtonText: {
    color: '#CBD5E1',
    fontWeight: '600',
    fontSize: 14,
  },
});
