/** Brand presets that the admin can switch between. */
export const FONT_PAIRS: Record<
  string,
  { label: string; display: string; google: string }
> = {
  grotesk: {
    label: "Space Grotesk — technical",
    display: '"Space Grotesk"',
    google: "Space+Grotesk:wght@400;500;600;700",
  },
  luxe: {
    label: "Playfair Display — luxury serif",
    display: '"Playfair Display"',
    google: "Playfair+Display:wght@500;600;700;800;900",
  },
  sora: {
    label: "Sora — modern",
    display: "Sora",
    google: "Sora:wght@400;600;700;800",
  },
  outfit: {
    label: "Outfit — geometric",
    display: "Outfit",
    google: "Outfit:wght@400;600;800;900",
  },
  syne: {
    label: "Syne — editorial",
    display: "Syne",
    google: "Syne:wght@500;700;800",
  },
};

export function fontPair(key: string) {
  return FONT_PAIRS[key] ?? FONT_PAIRS.grotesk;
}

export function googleFontsHref(key: string) {
  const pair = fontPair(key);
  return `https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;800;900&family=Inter:wght@300;400;500;600;800;900&family=${pair.google}&display=swap`;
}
