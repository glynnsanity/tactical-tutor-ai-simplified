import React, { memo } from 'react';
import { Linking, useColorScheme, View, StyleSheet } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { colors, radii } from '../theme';
import { Board } from './chess/Board';

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

/**
 * Parse [POSITION:fen] and [BOARD:fen] tags and replace them with board components
 */
function parsePositionTags(text: string): { content: string; boards: Map<string, string> } {
  const boards = new Map<string, string>();
  let counter = 0;
  
  // Replace both [POSITION:fen] and [BOARD:fen] with placeholders
  let content = text.replace(/\[(?:POSITION|BOARD):([^\]]+)\]/g, (match, fen) => {
    const boardId = `__BOARD_${counter}__`;
    boards.set(boardId, fen.trim());
    counter++;
    return `\n\n${boardId}\n\n`;
  });
  
  return { content, boards };
}

const MarkdownMessage = ({ text }: Props) => {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  
  // Parse position tags before rendering
  const { content, boards } = parsePositionTags(text);

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
    // Custom rule to render chess board placeholders
    paragraph: (node: any, children: any, parent: any, styles: any) => {
      // Check if this paragraph contains a board placeholder
      const textContent = getTextFromChildren(children);
      const boardMatch = textContent.match(/^__BOARD_(\d+)__$/);
      
      if (boardMatch) {
        const boardId = textContent.trim();
        const fen = boards.get(boardId);
        
        if (fen) {
          return (
            <View key={boardId} style={boardStyles.container}>
              <Board fen={fen} size={280} />
            </View>
          );
        }
      }
      
      // Default paragraph rendering
      return (
        <View key={node.key} style={styles.paragraph}>
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
      {content || '…'}
    </Markdown>
  );
};

const boardStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 12,
    paddingVertical: 8,
  },
});

export default memo(MarkdownMessage);


