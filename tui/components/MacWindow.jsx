/**
 * MacWindow — Reusable themed window component for the Ink TUI.
 *
 * Renders a bordered box with a coloured title bar, styled per the
 * active theme's inkBorder and CSS palette.
 *
 * Source: CSS-to-ANSI Translation Layer spec, Section 6.4.
 */

import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme.js";

export default function MacWindow({ title, children, width }) {
  const { palette } = useTheme();
  const css = palette.css || {};
  const borderStyle = palette.inkBorder || "round";

  return (
    <Box
      flexDirection="column"
      borderStyle={borderStyle}
      borderColor={css.border || "#2a2a3a"}
      width={width}
    >
      <Box paddingX={1}>
        <Text bold color={css.accent || "#da7756"}>
          {title}
        </Text>
      </Box>
      <Box paddingX={1} flexDirection="column">
        {children}
      </Box>
    </Box>
  );
}
