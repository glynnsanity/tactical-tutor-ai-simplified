export const colors = {
  headerBg: '#111827',
  background: '#ffffff',
  secondaryBg: '#f3f4f6',
  cardBg: '#ffffff',
  cardBorder: '#e5e7eb',
  text: '#111827',
  mutedText: '#6b7280',
  coachAccent: '#d4af37', // Gold accent for special highlights
  coachPrimary: '#0ea5e9', // Sky blue - main brand color
  success: '#16a34a',
  warning: '#ca8a04',
  danger: '#dc2626',
};

export const spacing = (n: number) => n * 4;

export const radii = {
  sm: 6,
  md: 12,
  lg: 16,
  xl: 20,
};

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
};
