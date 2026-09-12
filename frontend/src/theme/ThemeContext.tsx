import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemePreset = 'neon' | 'minimal-dark' | 'brutalist' | 'terminal-matrix' | 'minimal-light' | 'flowbite' | 'merchant-emerald';
export type ColorMode = 'dark' | 'light';
export type IconStyle = 'heroicons-outline' | 'heroicons-solid' | 'feather' | 'lucide' | 'monochrome-geometric' | 'ascii';
export type AccentColor =
  | 'cyan'
  | 'blue'
  | 'azure'
  | 'teal'
  | 'emerald'
  | 'jade'
  | 'lime'
  | 'yellow'
  | 'amber'
  | 'orange'
  | 'rose'
  | 'ruby'
  | 'indigo'
  | 'violet'
  | 'mono'
  | 'silver'
  | 'obsidian';

export type ColorPaletteId =
  | 'custom'
  | 'nordic-frost'
  | 'sunset-obsidian'
  | 'emerald-matrix'
  | 'monochrome-titanium'
  | 'cyberpunk-neon'
  | 'fintech-royal'
  | 'aurora-borealis'
  | 'tokyo-midnight';

export type BorderRadiusPreset = 'sharp' | 'compact' | 'smooth' | 'rounded';
export type LayoutMode = 'sidebar';

export interface ThemeConfig {
  preset: ThemePreset;
  mode: ColorMode;
  iconStyle: IconStyle;
  accent: AccentColor;
  palette: ColorPaletteId;
  radius: BorderRadiusPreset;
  layoutMode: LayoutMode;
}

const DEFAULT_THEME: ThemeConfig = {
  preset: 'minimal-dark',
  mode: 'dark',
  iconStyle: 'feather',
  accent: 'mono',
  palette: 'monochrome-titanium',
  radius: 'compact',
  layoutMode: 'sidebar',
};

const STORAGE_KEY = 'mcp_portal_theme_config';

interface ThemeContextType {
  theme: ThemeConfig;
  setPreset: (preset: ThemePreset) => void;
  setMode: (mode: ColorMode) => void;
  setIconStyle: (style: IconStyle) => void;
  setAccent: (accent: AccentColor) => void;
  setPalette: (palette: ColorPaletteId) => void;
  setRadius: (radius: BorderRadiusPreset) => void;
  setGlobalLayout: (layout: LayoutMode) => void;
  resetTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Cleanse legacy emoji styles to enterprise feather
        if (parsed.iconStyle === 'emoji' || parsed.iconStyle === 'svg' || parsed.iconStyle === 'material' || parsed.iconStyle === 'heroicons' || parsed.iconStyle === 'heroicons-outline') {
          parsed.iconStyle = 'feather';
        }
        parsed.layoutMode = 'sidebar';
        return { ...DEFAULT_THEME, ...parsed };
      }
    } catch {}
    return DEFAULT_THEME;
  });

  const applyThemeToDOM = (cfg: ThemeConfig) => {
    const root = document.documentElement;
    root.setAttribute('data-theme', cfg.preset);
    root.setAttribute('data-mode', cfg.mode);
    root.setAttribute('data-icons', cfg.iconStyle);
    root.setAttribute('data-accent', cfg.accent);
    root.setAttribute('data-palette', cfg.palette || 'custom');
    root.setAttribute('data-radius', cfg.radius);
    root.setAttribute('data-layout', cfg.layoutMode);
  };

  useEffect(() => {
    applyThemeToDOM(theme);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
    } catch {}
  }, [theme]);

  const setPreset = (preset: ThemePreset) => {
    setThemeState((prev) => {
      let mode = prev.mode;
      let radius = prev.radius;
      let accent = prev.accent;

      if (preset === 'minimal-light') {
        mode = 'light';
        radius = 'smooth';
      } else if (preset === 'flowbite') {
        accent = 'blue';
        radius = 'compact';
      } else if (preset === 'merchant-emerald') {
        mode = 'dark';
        accent = 'emerald';
        radius = 'smooth';
      } else if (preset === 'brutalist') {
        mode = 'dark';
        radius = 'sharp';
        accent = 'yellow';
      } else if (preset === 'terminal-matrix') {
        mode = 'dark';
        radius = 'compact';
        accent = 'emerald';
      } else if (preset === 'minimal-dark') {
        mode = 'dark';
        radius = 'compact';
        accent = 'mono';
      }

      return { ...prev, preset, mode, radius, accent };
    });
  };

  const setMode = (mode: ColorMode) => {
    setThemeState((prev) => ({
      ...prev,
      mode,
      preset: mode === 'light' ? 'minimal-light' : (prev.preset === 'minimal-light' ? 'minimal-dark' : prev.preset),
    }));
  };

  const setIconStyle = (iconStyle: IconStyle) => {
    setThemeState((prev) => ({ ...prev, iconStyle }));
  };

  const setAccent = (accent: AccentColor) => {
    setThemeState((prev) => ({ ...prev, accent, palette: 'custom' }));
  };

  const setPalette = (palette: ColorPaletteId) => {
    setThemeState((prev) => {
      let accent: AccentColor = prev.accent;
      if (palette === 'nordic-frost') accent = 'azure';
      else if (palette === 'sunset-obsidian') accent = 'amber';
      else if (palette === 'emerald-matrix') accent = 'emerald';
      else if (palette === 'monochrome-titanium') accent = 'mono';
      else if (palette === 'cyberpunk-neon') accent = 'cyan';
      else if (palette === 'fintech-royal') accent = 'blue';
      else if (palette === 'aurora-borealis') accent = 'teal';
      else if (palette === 'tokyo-midnight') accent = 'rose';

      return { ...prev, palette, accent };
    });
  };

  const setRadius = (radius: BorderRadiusPreset) => {
    setThemeState((prev) => ({ ...prev, radius }));
  };

  const setGlobalLayout = (layoutMode: LayoutMode) => {
    setThemeState((prev) => ({ ...prev, layoutMode }));
  };

  const resetTheme = () => {
    setThemeState(DEFAULT_THEME);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setPreset,
        setMode,
        setIconStyle,
        setAccent,
        setPalette,
        setRadius,
        setGlobalLayout,
        resetTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export type IconName =
  | 'services'
  | 'secrets'
  | 'users'
  | 'dev'
  | 'audit'
  | 'products'
  | 'xero'
  | 'bigquery'
  | 'firestore'
  | 'sagehr'
  | 'slack'
  | 'lightning'
  | 'shield'
  | 'check'
  | 'alert'
  | 'info'
  | 'edit'
  | 'trash'
  | 'logout'
  | 'sun'
  | 'moon'
  | 'sparkles'
  | 'mcp'
  | 'plus'
  | 'search'
  | 'filter'
  | 'cog'
  | 'download'
  | 'chevronLeft'
  | 'chevronRight'
  | 'xmark'
  | 'home'
  | 'shop'
  | 'creditCard'
  | 'document'
  | 'code'
  | 'globe'
  | 'cloud'
  | 'checkCircle';

/**
 * Universal Theme-Aware Monochromatic Enterprise Icon Component.
 * Supports: Heroicons Outline, Heroicons Solid, Feather Minimalist, Lucide Precision, Monochrome Geometric & Retro Monospace Badges.
 * All icons inherit currentColor and adapt dynamically to light/dark modes without white-on-white washed out displays.
 */
export const ThemeIcon: React.FC<{
  name: IconName;
  className?: string;
  size?: number;
}> = ({ name, className = '', size = 16 }) => {
  const { theme } = useTheme();
  const { iconStyle } = theme;

  // 1. Retro Monospace Badges
  if (iconStyle === 'ascii') {
    const asciiMap: Record<string, string> = {
      services: '[SRV]',
      secrets: '[SEC]',
      users: '[USR]',
      dev: '[DEV]',
      audit: '[AUD]',
      products: '[PRD]',
      xero: '[XRO]',
      bigquery: '[B-Q]',
      firestore: '[F-S]',
      sagehr: '[SHR]',
      slack: '[SLK]',
      lightning: '[⚡]',
      shield: '[GRD]',
      check: '[OK]',
      alert: '[!]',
      info: '[i]',
      edit: '[EDT]',
      trash: '[DEL]',
      logout: '[EXT]',
      sun: '[LGT]',
      moon: '[DRK]',
      sparkles: '[*]',
      plus: '[+]',
      search: '[?]',
      filter: '[FLT]',
      cog: '[CFG]',
      download: '[DL]',
      chevronLeft: '[<]',
      chevronRight: '[>]',
      xmark: '[X]',
      home: '[HOM]',
      shop: '[SHP]',
      creditCard: '[PAY]',
      document: '[DOC]',
      code: '[COD]',
      globe: '[WEB]',
      cloud: '[CLD]',
      checkCircle: '[OK*]',
    };
    return (
      <span
        className={`ascii-icon ${className}`}
        style={{
          fontFamily: 'var(--font-mono)',
          fontWeight: 700,
          fontSize: '0.75em',
          letterSpacing: '0.05em',
          display: 'inline-block',
          color: 'currentColor',
        }}
      >
        {asciiMap[name] || `[${name.toUpperCase().slice(0, 3)}]`}
      </span>
    );
  }

  // 2. Heroicons Solid v2 (Bold Filled Monochrome)
  if (iconStyle === 'heroicons-solid') {
    const solidProps = {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'currentColor',
      className: `heroicon-solid ${className}`,
      style: { verticalAlign: 'middle', display: 'inline-block', color: 'currentColor' },
    };

    switch (name) {
      case 'services':
        return (
          <svg {...solidProps}>
            <path d="M4.5 3.75a3 3 0 0 0-3 3v.75h21v-.75a3 3 0 0 0-3-3h-15ZM1.5 10.5v3h21v-3h-21ZM1.5 16.5v.75a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3v-.75h-21Z" />
          </svg>
        );
      case 'secrets':
        return (
          <svg {...solidProps}>
            <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z" clipRule="evenodd" />
          </svg>
        );
      case 'users':
        return (
          <svg {...solidProps}>
            <path d="M4.5 6.375a4.125 4.125 0 1 1 8.25 0 4.125 4.125 0 0 1-8.25 0ZM14.25 8.625a3.375 3.375 0 1 1 6.75 0 3.375 3.375 0 0 1-6.75 0ZM1.5 19.125a7.125 7.125 0 0 1 14.25 0v.75h-14.25v-.75ZM16.5 19.875v-.75a5.625 5.625 0 0 0-3.18-5.04 8.625 8.625 0 0 1 9.18 5.04v.75h-6Z" />
          </svg>
        );
      case 'dev':
        return (
          <svg {...solidProps}>
            <path fillRule="evenodd" d="M3 6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6Zm14.25 6-3.72-3.72a.75.75 0 0 0-1.06 1.06L15.19 12l-2.72 2.72a.75.75 0 1 0 1.06 1.06l3.72-3.72a.75.75 0 0 0 0-1.06Zm-6.44-3.72a.75.75 0 0 0-1.06-1.06L5.97 11.47a.75.75 0 0 0 0 1.06l3.72 3.72a.75.75 0 0 0 1.06-1.06L8.03 12l2.72-2.72Z" clipRule="evenodd" />
          </svg>
        );
      case 'audit':
        return (
          <svg {...solidProps}>
            <path fillRule="evenodd" d="M5.625 1.5H9a3.75 3.75 0 0 1 3.75 3.75v1.875c0 1.035.84 1.875 1.875 1.875H16.5a3.75 3.75 0 0 1 3.75 3.75v7.875c0 2.071-1.679 3.75-3.75 3.75H5.625a3.75 3.75 0 0 1-3.75-3.75V5.25c0-2.071 1.679-3.75 3.75-3.75ZM12.75 12a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5Zm0 3.75a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5Zm-6-3a.75.75 0 0 0 0 1.5h1.5a.75.75 0 0 0 0-1.5h-1.5Zm0 3.75a.75.75 0 0 0 0 1.5h1.5a.75.75 0 0 0 0-1.5h-1.5Z" clipRule="evenodd" />
          </svg>
        );
      case 'products':
      case 'shop':
        return (
          <svg {...solidProps}>
            <path d="M2.25 2.25a.75.75 0 0 0 0 1.5h1.386c.17 0 .318.114.362.278l2.558 9.592a3.752 3.752 0 0 0-2.806 3.63c0 .414.336.75.75.75h15.75a.75.75 0 0 0 0-1.5H5.856a2.25 2.25 0 0 1 2.174-1.68h10.47a2.25 2.25 0 0 0 2.174-1.68l1.62-6.075a.75.75 0 0 0-.724-.945H5.27L4.73 3.195A1.875 1.875 0 0 0 2.916 2.25H2.25ZM7.5 21a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm9 0a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z" />
          </svg>
        );
      case 'xero':
        return (
          <svg {...solidProps}>
            <path d="M18.375 2.25c-1.035 0-1.875.84-1.875 1.875v15.75c0 1.035.84 1.875 1.875 1.875h1.5c1.035 0 1.875-.84 1.875-1.875V4.125c0-1.035-.84-1.875-1.875-1.875h-1.5ZM11.25 7.5c-1.035 0-1.875.84-1.875 1.875v10.5c0 1.035.84 1.875 1.875 1.875h1.5c1.035 0 1.875-.84 1.875-1.875v-10.5c0-1.035-.84-1.875-1.875-1.875h-1.5ZM4.125 12.75c-1.035 0-1.875.84-1.875 1.875v5.25c0 1.035.84 1.875 1.875 1.875h1.5c1.035 0 1.875-.84 1.875-1.875v-5.25c0-1.035-.84-1.875-1.875-1.875h-1.5Z" />
          </svg>
        );
      case 'bigquery':
        return (
          <svg {...solidProps}>
            <path fillRule="evenodd" d="M10.5 3.75a6.75 6.75 0 1 0 4.225 12.016l4.754 4.755a.75.75 0 0 0 1.06-1.06l-4.754-4.755A6.75 6.75 0 0 0 10.5 3.75Zm-5.25 6.75a5.25 5.25 0 1 1 10.5 0 5.25 5.25 0 0 1-10.5 0Z" clipRule="evenodd" />
          </svg>
        );
      case 'firestore':
        return (
          <svg {...solidProps}>
            <path d="M12.378 1.602a.75.75 0 0 0-.756 0L3.372 6.252a.75.75 0 0 0-.372.648v10.2a.75.75 0 0 0 .372.648l8.25 4.65a.75.75 0 0 0 .756 0l8.25-4.65a.75.75 0 0 0 .372-.648V6.9a.75.75 0 0 0-.372-.648l-8.25-4.65Z" />
          </svg>
        );
      case 'sagehr':
        return (
          <svg {...solidProps}>
            <path d="M12 2.25a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9ZM3.75 19.5a8.25 8.25 0 0 1 16.5 0v.75H3.75v-.75Z" />
          </svg>
        );
      case 'slack':
        return (
          <svg {...solidProps}>
            <path fillRule="evenodd" d="M10.5 3.75a6.75 6.75 0 1 0 4.225 12.016l4.754 4.755a.75.75 0 0 0 1.06-1.06l-4.754-4.755A6.75 6.75 0 0 0 10.5 3.75Zm-5.25 6.75a5.25 5.25 0 1 1 10.5 0 5.25 5.25 0 0 1-10.5 0Z" clipRule="evenodd" />
          </svg>
        );
      case 'lightning':
        return (
          <svg {...solidProps}>
            <path d="M14.615 1.595a.75.75 0 0 1 .359.852L12.982 9.75h6.018a.75.75 0 0 1 .586 1.218l-9 11.25a.75.75 0 0 1-1.344-.668l1.992-7.3H5.25a.75.75 0 0 1-.586-1.218l9-11.25a.75.75 0 0 1 .951-.187Z" />
          </svg>
        );
      case 'cloud':
        return (
          <svg {...solidProps}>
            <path d="M4.5 9.75a6 6 0 0 1 11.573-2.226 3.75 3.75 0 0 1 4.177 4.226 4.5 4.5 0 0 1-3.75 5.25H4.5A4.5 4.5 0 0 1 4.5 9.75Z" />
          </svg>
        );
      case 'shield':
        return (
          <svg {...solidProps}>
            <path fillRule="evenodd" d="M12.516 2.17a.75.75 0 0 0-1.032 0 11.209 11.209 0 0 1-7.877 3.08.75.75 0 0 0-.722.515A12.74 12.74 0 0 0 2.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 0 0 .374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 0 0-.722-.516l-.143.001c-2.996 0-5.717-1.17-7.734-3.08Z" clipRule="evenodd" />
          </svg>
        );
      case 'check':
      case 'checkCircle':
        return (
          <svg {...solidProps}>
            <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clipRule="evenodd" />
          </svg>
        );
      case 'trash':
        return (
          <svg {...solidProps}>
            <path fillRule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 0 1 3.878.512.75.75 0 1 1-.256 1.478l-.209-.035-1.005 13.07a3 3 0 0 1-2.991 2.77H8.084a3 3 0 0 1-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 0 1-.256-1.478A48.567 48.567 0 0 1 7.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 0 1 3.369 0c1.603.051 2.815 1.387 2.815 2.951Zm-6.136-1.452a51.196 51.196 0 0 1 3.273 0C14.09 3.05 14.5 3.518 14.5 4.09v.4h-5v-.4c0-.572.41-1.04 1.364-1.064Z" clipRule="evenodd" />
          </svg>
        );
      case 'cog':
        return (
          <svg {...solidProps}>
            <path fillRule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.42.147-.82.338-1.198.57L6.65 4.672a1.875 1.875 0 0 0-2.285.518l-1.5 2.078a1.875 1.875 0 0 0 .284 2.332l1.018.917a7.24 7.24 0 0 0 0 1.466l-1.018.917a1.875 1.875 0 0 0-.284 2.332l1.5 2.078c.552.766 1.58.995 2.285.518l1.202-.787c.378.232.778.423 1.198.57l.178 1.072c.151.904.933 1.567 1.85 1.567h2.844c.917 0 1.699-.663 1.85-1.567l.178-1.072c.42-.147.82-.338 1.198-.57l1.202.787a1.875 1.875 0 0 0 2.285-.518l1.5-2.078a1.875 1.875 0 0 0-.284-2.332l-1.018-.917c.052-.482.052-.984 0-1.466l1.018-.917a1.875 1.875 0 0 0 .284-2.332l-1.5-2.078a1.875 1.875 0 0 0-2.285-.518l-1.202.787c-.378-.232-.778-.423-1.198-.57l-.178-1.072a1.875 1.875 0 0 0-1.85-1.567h-2.844ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
          </svg>
        );
      case 'sun':
        return (
          <svg {...solidProps}>
            <path d="M12 2.25a.75.75 0 0 1 .75.75v2.25a.75.75 0 0 1-1.5 0V3a.75.75 0 0 1 .75-.75ZM7.5 12a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM18.894 6.166a.75.75 0 0 0-1.06-1.06l-1.591 1.59a.75.75 0 1 0 1.06 1.061l1.591-1.59ZM21.75 12a.75.75 0 0 1-.75.75h-2.25a.75.75 0 0 1 0-1.5H21a.75.75 0 0 1 .75.75ZM17.834 18.894a.75.75 0 0 0 1.06-1.06l-1.59-1.591a.75.75 0 1 0-1.061 1.06l1.59 1.591ZM12 18a.75.75 0 0 1 .75.75V21a.75.75 0 0 1-1.5 0v-2.25A.75.75 0 0 1 12 18ZM7.758 17.303a.75.75 0 0 0-1.061-1.06l-1.591 1.59a.75.75 0 0 0 1.06 1.061l1.591-1.59ZM6 12a.75.75 0 0 1-.75.75H3a.75.75 0 0 1 0-1.5h2.25A.75.75 0 0 1 6 12ZM6.697 7.757a.75.75 0 0 0 1.06-1.06l-1.59-1.591a.75.75 0 0 0-1.061 1.06l1.59 1.591Z" />
          </svg>
        );
      case 'info':
        return (
          <svg {...solidProps}>
            <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 0 1 .67 1.34l-.04.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 1 1-.671-1.34l.041-.022ZM12 9a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" />
          </svg>
        );
      case 'moon':
        return (
          <svg {...solidProps}>
            <path fillRule="evenodd" d="M9.528 1.718a.75.75 0 0 1 .162.819A8.97 8.97 0 0 0 9 6a9 9 0 0 0 9 9 8.97 8.97 0 0 0 3.463-.69.75.75 0 0 1 .981.98 10.503 10.503 0 0 1-9.694 6.46c-5.799 0-10.5-4.7-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 0 1 .818.162Z" clipRule="evenodd" />
          </svg>
        );
    }
  }

  // 3. Default: Heroicons Outline v2 & Vector Stroke Suite (Feather, Lucide, Geometric)
  const strokeWidth = iconStyle === 'monochrome-geometric' ? 2.25 : iconStyle === 'feather' ? 1.85 : 1.75;
  const svgProps = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: `enterprise-icon ${className}`,
    style: { verticalAlign: 'middle', display: 'inline-block', color: 'currentColor' },
  };

  switch (name) {
    case 'services':
      return (
        <svg {...svgProps}>
          <rect x="2" y="3" width="20" height="6" rx="1.5" />
          <rect x="2" y="15" width="20" height="6" rx="1.5" />
          <circle cx="6" cy="6" r="1" fill="currentColor" />
          <circle cx="6" cy="18" r="1" fill="currentColor" />
        </svg>
      );
    case 'secrets':
      return (
        <svg {...svgProps}>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      );
    case 'users':
      return (
        <svg {...svgProps}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'dev':
      return (
        <svg {...svgProps}>
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      );
    case 'audit':
      return (
        <svg {...svgProps}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      );
    case 'products':
      return (
        <svg {...svgProps}>
          <path d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
        </svg>
      );
    case 'xero':
      return (
        <svg {...svgProps}>
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      );
    case 'bigquery':
      return (
        <svg {...svgProps}>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      );
    case 'firestore':
      return (
        <svg {...svgProps}>
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
        </svg>
      );
    case 'sagehr':
      return (
        <svg {...svgProps}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case 'slack':
      return (
        <svg {...svgProps}>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      );
    case 'lightning':
      return (
        <svg {...svgProps}>
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    case 'cloud':
      return (
        <svg {...svgProps}>
          <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
        </svg>
      );
    case 'mcp':
      return (
        <svg {...svgProps} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M 4.5 11 L 12.5 3 A 2.2 2.2 0 0 1 15.6 6.1 L 9.2 12.5 A 1.5 1.5 0 0 0 11.3 14.6 L 17.3 8.6 A 2.2 2.2 0 0 1 20.4 11.7 L 13 19.1 C 12 20.1 12 21.3 13.8 23.1" />
        </svg>
      );
    case 'shield':
      return (
        <svg {...svgProps}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case 'check':
      return (
        <svg {...svgProps}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    case 'checkCircle':
      return (
        <svg {...svgProps}>
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      );
    case 'alert':
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      );
    case 'edit':
      return (
        <svg {...svgProps}>
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      );
    case 'trash':
      return (
        <svg {...svgProps}>
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      );
    case 'plus':
      return (
        <svg {...svgProps}>
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      );
    case 'search':
      return (
        <svg {...svgProps}>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      );
    case 'filter':
      return (
        <svg {...svgProps}>
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
      );
    case 'cog':
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
    case 'sun':
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      );
    case 'moon':
      return (
        <svg {...svgProps}>
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      );
    case 'sparkles':
      return (
        <svg {...svgProps}>
          <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
        </svg>
      );
    case 'download':
      return (
        <svg {...svgProps}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      );
    case 'chevronLeft':
      return (
        <svg {...svgProps}>
          <polyline points="15 18 9 12 15 6" />
        </svg>
      );
    case 'chevronRight':
      return (
        <svg {...svgProps}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      );
    case 'xmark':
      return (
        <svg {...svgProps}>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      );
    case 'home':
      return (
        <svg {...svgProps}>
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      );
    case 'shop':
      return (
        <svg {...svgProps}>
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
      );
    case 'creditCard':
      return (
        <svg {...svgProps}>
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
          <line x1="1" y1="10" x2="23" y2="10" />
        </svg>
      );
    case 'document':
      return (
        <svg {...svgProps}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      );
    case 'code':
      return (
        <svg {...svgProps}>
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      );
    case 'globe':
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      );
    case 'info':
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      );
    case 'logout':
      return (
        <svg {...svgProps}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      );
    default:
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      );
  }
};
