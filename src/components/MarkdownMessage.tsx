import React, { memo } from 'react';
import { Linking, useColorScheme, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { colors, radii } from '../theme';

type Props = {
  text: string;
};

function getTextFromChildren(children: any): string {
  if (children == null) return '';
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(getTextFromChildren).join('');
  if (React.isValidElement(children)) return getTextFromChildren((children as any).props?.children);
  return '';
}

const MarkdownMessage = ({ text }: Props) => {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const mdStyles = {
    body: {
      color: isDark ? '#f9fafb' : colors.text,
      fontSize: 15,
      lineHeight: 20,
    },
    text: {
      color: isDark ? '#f3f4f6' : colors.text,
    },
    paragraph: {
      marginTop: 2,
      marginBottom: 8,
    },
    bullet_list: {
      marginBottom: 8,
    },
    ordered_list: {
      marginBottom: 8,
    },
    list_item: {
      marginBottom: 4,
    },
    strong: {
      fontWeight: '700',
      color: isDark ? '#fafafa' : colors.text,
    },
    em: {
      fontStyle: 'italic',
    },
    link: {
      color: colors.coachPrimary,
      textDecorationLine: 'underline',
    },
    code_inline: {
      fontFamily: 'Menlo',
      backgroundColor: isDark ? '#111827' : '#f8fafc',
      color: isDark ? '#e5e7eb' : '#111827',
      paddingVertical: 2,
      paddingHorizontal: 6,
      borderRadius: 6,
    },
    fence: {
      fontFamily: 'Menlo',
      backgroundColor: isDark ? '#0b1220' : '#f3f4f6',
      color: isDark ? '#e5e7eb' : '#111827',
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? '#1f2937' : colors.cardBorder,
      overflow: 'hidden',
    },
    code_block: {
      fontFamily: 'Menlo',
      backgroundColor: isDark ? '#0b1220' : '#f3f4f6',
      color: isDark ? '#e5e7eb' : '#111827',
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? '#1f2937' : colors.cardBorder,
      overflow: 'hidden',
    },
    blockquote: {
      backgroundColor: isDark ? '#0b1220' : colors.secondaryBg,
      borderLeftWidth: 4,
      borderRadius: radii.md,
      paddingVertical: 8,
      paddingHorizontal: 12,
      marginBottom: 10,
      borderLeftColor: colors.coachPrimary,
    },
    heading1: { fontSize: 22, fontWeight: '700', marginBottom: 8, color: isDark ? '#f9fafb' : colors.text },
    heading2: { fontSize: 20, fontWeight: '700', marginBottom: 8, color: isDark ? '#f9fafb' : colors.text },
    heading3: { fontSize: 18, fontWeight: '700', marginBottom: 8, color: isDark ? '#f9fafb' : colors.text },
  } as const;

  const rules = {
    blockquote: (node: any, children: any, parent: any, styles: any) => {
      const flatText = getTextFromChildren(children);
      let accent = colors.coachPrimary;
      if (/^\s*\**\s*Warning:/i.test(flatText)) accent = colors.warning;
      else if (/^\s*\**\s*Tip:/i.test(flatText)) accent = colors.success;
      else if (/^\s*\**\s*Info:/i.test(flatText)) accent = colors.coachPrimary;

      return (
        <View style={{
          backgroundColor: isDark ? '#0b1220' : colors.secondaryBg,
          borderLeftWidth: 4,
          borderLeftColor: accent,
          borderRadius: radii.md,
          paddingVertical: 8,
          paddingHorizontal: 12,
          marginBottom: 10,
        }}>
          {children}
        </View>
      );
    },
  } as const;

  return (
    <Markdown
      style={mdStyles as any}
      onLinkPress={(url) => {
        if (!url) return false;
        Linking.openURL(url).catch(() => {});
        return false;
      }}
      rules={rules as any}
    >
      {text || '…'}
    </Markdown>
  );
};

export default memo(MarkdownMessage);


