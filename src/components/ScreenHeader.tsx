import React from 'react';
import { View, Text } from 'react-native';
import { colors } from '../theme';

export const ScreenHeader: React.FC<{ title: string; subtitle?: string; LeftIcon?: React.ComponentType<{ size?: number; color?: string }> }>
= ({ title, subtitle, LeftIcon }) => {
  return (
    <View style={{ backgroundColor: colors.headerBg, padding: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {!!LeftIcon && (
          <View style={{ padding: 8, backgroundColor: 'rgba(212,175,55,0.2)', borderRadius: 8, marginRight: 12 }}>
            <LeftIcon size={24} color={colors.coachAccent} />
          </View>
        )}
        <View>
          <Text style={{ color: 'white', fontSize: 18, fontWeight: '700' }}>{title}</Text>
          {!!subtitle && <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>{subtitle}</Text>}
        </View>
      </View>
    </View>
  );
};
