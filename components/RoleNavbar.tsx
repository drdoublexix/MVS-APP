import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

export interface RoleNavbarProps {
  role: 'client' | 'vet' | 'merchant';
  onRoleChange: (role: 'client' | 'vet' | 'merchant') => void;
}

export const RoleNavbar: React.FC<RoleNavbarProps> = ({ role, onRoleChange }) => {
  const roles = [
    { id: 'client' as const, icon: 'paw', label: 'Client' },
    { id: 'vet' as const, icon: 'hospital-box', label: 'Vet' },
    { id: 'merchant' as const, icon: 'storefront', label: 'Merchant' },
  ];

  return (
    <View style={styles.container}>
      {roles.map((r) => {
        const isActive = role === r.id;
        const containerStyle = [styles.navButton, isActive && styles.navButtonActive];
        const iconColor = isActive ? '#fff' : '#999';
        const bgColor = 
          r.id === 'client' ? '#0a7ea4' :
          r.id === 'vet' ? '#4ECDC4' :
          '#45B7D1';

        return (
          <TouchableOpacity
            key={r.id}
            style={containerStyle}
            onPress={() => onRoleChange(r.id)}
            activeOpacity={0.7}
          >
            <View 
              style={[
                styles.iconContainer, 
                isActive && { backgroundColor: bgColor }
              ]}
            >
              <MaterialCommunityIcons 
                name={r.icon as any} 
                size={24} 
                color={iconColor} 
              />
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopColor: '#eee',
    borderTopWidth: 1,
    paddingVertical: 8,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  navButton: {
    padding: 12,
    borderRadius: 12,
  },
  navButtonActive: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
