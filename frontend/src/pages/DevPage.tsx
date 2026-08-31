import React, { useState } from 'react';
import {
  useTheme,
  ThemePreset,
  IconStyle,
  AccentColor,
  ColorPaletteId,
  BorderRadiusPreset,
  LayoutMode,
  ThemeIcon,
} from '../theme/ThemeContext.js';
interface DevPageProps {
  onShowToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const DevPage: React.FC<DevPageProps> = ({ onShowToast }) => {
  const { theme, setPreset, setMode, setIconStyle, setAccent, setPalette, setRadius, setGlobalLayout, resetTheme } = useTheme();

  const [copiedTokens, setCopiedTokens] = useState(false);

  const layouts: {
    id: LayoutMode;
    title: string;
    description: string;
    badge: string;
    icon: string;
  }[] = [
    {
      id: 'sidebar',
      title: 'Monochrome Sidebar Portal',
      description: 'Ultra-minimalist Linear/Vercel style with 240px left-hand application menu and unified enterprise telemetry.',
      badge: 'STANDARD',
      icon: '🖤',
    },
  ];

  const presets: {
    id: ThemePreset;
    title: string;
    description: string;
    badge: string;
    icon: string;
    bgPreview: string;
    borderPreview: string;
  }[] = [
    {
      id: 'minimal-dark',
      title: 'Dark Minimalist',
      description: 'Ultra-clean slate & zinc monochrome, flat subtle borders, zero blur/glow.',
      badge: 'DEFAULT',
      icon: '⬛',
      bgPreview: '#09090B',
      borderPreview: '#27272A',
    },
    {
      id: 'neon',
      title: 'Neon Cyberpunk',
      description: 'Frosted glassmorphism, glowing halos, vibrant cyan & indigo gradients.',
      badge: 'CYBERPUNK',
      icon: '🌌',
      bgPreview: '#080C14',
      borderPreview: '#06B6D4',
    },
    {
      id: 'flowbite',
      title: 'Flowbite Enterprise',
      description: 'Clean Tailwind UI aesthetics, Flowbite Blue (#1C64F2), crisp gray borders, and enterprise data tables.',
      badge: 'FLOWBITE',
      icon: '🔷',
      bgPreview: '#FFFFFF',
      borderPreview: '#1C64F2',
    },
    {
      id: 'merchant-emerald',
      title: 'Merchant Emerald',
      description: 'Deep slate & charcoal surfaces with vibrant emerald green highlights and rich card shadows.',
      badge: 'STOREFRONT',
      icon: '💎',
      bgPreview: '#0B0F19',
      borderPreview: '#10B981',
    },
    {
      id: 'terminal-matrix',
      title: 'Terminal Matrix',
      description: 'CRT phosphor green & cyan telemetry, monospace typography throughout.',
      badge: 'MONO CRT',
      icon: '📟',
      bgPreview: '#050B07',
      borderPreview: '#00FF66',
    },
    {
      id: 'minimal-light',
      title: 'Minimal Light Mode',
      description: 'Crisp white/slate enterprise palette, high contrast typography, soft slate shadows.',
      badge: 'LIGHT',
      icon: '☀️',
      bgPreview: '#F8FAFC',
      borderPreview: '#0284C7',
    },
  ];

  // Grouped Single Accent Colors
  const accentCategories: {
    category: string;
    colors: { id: AccentColor; label: string; color: string }[];
  }[] = [
    {
      category: 'Enterprise Blues & Teals',
      colors: [
        { id: 'cyan', label: 'Sky Cyan', color: '#06B6D4' },
        { id: 'blue', label: 'Flowbite Blue', color: '#1C64F2' },
        { id: 'azure', label: 'Ocean Azure', color: '#0284C7' },
        { id: 'teal', label: 'Electric Teal', color: '#0D9488' },
      ],
    },
    {
      category: 'Emerald & Neon Greens',
      colors: [
        { id: 'emerald', label: 'Mint Emerald', color: '#10B981' },
        { id: 'jade', label: 'Forest Jade', color: '#059669' },
        { id: 'lime', label: 'Matrix Lime', color: '#84CC16' },
      ],
    },
    {
      category: 'Ambers, Warmth & Golds',
      colors: [
        { id: 'yellow', label: 'Brutalist Gold', color: '#FFE600' },
        { id: 'amber', label: 'Sunset Amber', color: '#F59E0B' },
        { id: 'orange', label: 'Coral Orange', color: '#F97316' },
      ],
    },
    {
      category: 'Crimson & Royal Purples',
      colors: [
        { id: 'rose', label: 'Hot Rose', color: '#F43F5E' },
        { id: 'ruby', label: 'Crimson Ruby', color: '#E11D48' },
        { id: 'indigo', label: 'Royal Indigo', color: '#6366F1' },
        { id: 'violet', label: 'Violet Purple', color: '#8B5CF6' },
      ],
    },
    {
      category: 'Titanium & Monochromes',
      colors: [
        { id: 'mono', label: 'Titanium White', color: '#FAFAFA' },
        { id: 'silver', label: 'Zinc Silver', color: '#A1A1AA' },
        { id: 'obsidian', label: 'Obsidian Slate', color: '#27272A' },
      ],
    },
  ];

  // Curated Multi-Color Harmonious Palettes
  const palettes: {
    id: ColorPaletteId;
    title: string;
    description: string;
    colors: string[];
  }[] = [
    {
      id: 'nordic-frost',
      title: 'Nordic Frost',
      description: 'Crisp Arctic sky, sub-zero indigo, glacial slate & midnight navy.',
      colors: ['#38BDF8', '#818CF8', '#94A3B8', '#0F172A'],
    },
    {
      id: 'sunset-obsidian',
      title: 'Sunset Obsidian',
      description: 'Amber twilight, dusk rose, twilight violet & dark charcoal.',
      colors: ['#F59E0B', '#F43F5E', '#8B5CF6', '#18181B'],
    },
    {
      id: 'emerald-matrix',
      title: 'Emerald Matrix',
      description: 'Luminous mint, cyber emerald, deep pine & abyssal jade.',
      colors: ['#34D399', '#059669', '#047857', '#064E3B'],
    },
    {
      id: 'monochrome-titanium',
      title: 'Monochrome Titanium',
      description: 'Pure white, brushed zinc silver, graphite slate & carbon black.',
      colors: ['#FFFFFF', '#D4D4D8', '#71717A', '#18181B'],
    },
    {
      id: 'cyberpunk-neon',
      title: 'Cyberpunk Neon',
      description: 'Electric cyan, neon magenta, high-voltage yellow & cyber indigo.',
      colors: ['#06B6D4', '#F43F5E', '#FFE600', '#6366F1'],
    },
    {
      id: 'fintech-royal',
      title: 'FinTech Royal',
      description: 'Institutional blue, asset emerald, regulatory slate & sovereign gold.',
      colors: ['#1C64F2', '#10B981', '#64748B', '#FBBF24'],
    },
    {
      id: 'aurora-borealis',
      title: 'Aurora Borealis',
      description: 'Luminescent teal, celestial purple & polar blue.',
      colors: ['#2DD4BF', '#A855F7', '#3B82F6', '#0F172A'],
    },
    {
      id: 'tokyo-midnight',
      title: 'Tokyo Midnight',
      description: 'Neon sakura, Shinjuku indigo & Shibuya cyan.',
      colors: ['#EC4899', '#6366F1', '#06B6D4', '#09090B'],
    },
  ];

  const radiusOptions: { id: BorderRadiusPreset; label: string; px: string }[] = [
    { id: 'sharp', label: 'Sharp', px: '0px' },
    { id: 'compact', label: 'Compact', px: '4px' },
    { id: 'smooth', label: 'Smooth', px: '10px' },
    { id: 'rounded', label: 'Rounded', px: '18px' },
  ];

  const iconStyles: { id: IconStyle; label: string; preview: string; badge: string }[] = [
    { id: 'heroicons-outline', label: 'Heroicons Outline (v2)', preview: '24x24 Clean Stroke Vector Glyphs', badge: 'RECOMMENDED' },
    { id: 'heroicons-solid', label: 'Heroicons Solid (v2)', preview: 'High-Contrast Solid Filled Monochromes', badge: 'BOLD' },
    { id: 'feather', label: 'Feather Minimalist', preview: 'Feather Geometric Vector Outlines', badge: 'MINIMAL' },
    { id: 'lucide', label: 'Lucide Precision', preview: 'Finely Calibrated Enterprise Icons', badge: 'PRECISION' },
    { id: 'monochrome-geometric', label: 'Monochrome Geometric', preview: 'High-Density Sharp Vector Shapes', badge: 'GEOMETRIC' },
    { id: 'ascii', label: 'Retro Monospace Badges', preview: '[SRV] [SEC] [USR] [DEV] [AUD]', badge: 'RETRO MONO' },
  ];

  const handleCopyTokens = () => {
    const tokens = `/* MCP Admin Portal Active Theme Tokens */
[data-theme="${theme.preset}"][data-mode="${theme.mode}"][data-icons="${theme.iconStyle}"][data-accent="${theme.accent}"][data-palette="${theme.palette}"][data-radius="${theme.radius}"][data-layout="${theme.layoutMode}"] {
  --theme-preset: ${theme.preset};
  --color-mode: ${theme.mode};
  --icon-style: ${theme.iconStyle};
  --accent-color: ${theme.accent};
  --color-palette: ${theme.palette};
  --border-radius: ${theme.radius};
  --portal-layout: ${theme.layoutMode};
}`;
    navigator.clipboard.writeText(tokens);
    setCopiedTokens(true);
    if (onShowToast) onShowToast('Active CSS tokens copied to clipboard!', 'success');
    setTimeout(() => setCopiedTokens(false), 2500);
  };

  return (
    <div className="dev-page">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <ThemeIcon name="dev" size={24} />
            <h2>Developer Design Studio & Theme Engine</h2>
          </div>
          <p>
            Real-time visual customization engine. Switch portal layouts, enterprise monochromatic icon styles, color modes, and multi-color palettes.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={handleCopyTokens}>
            <ThemeIcon name="code" size={14} />
            <span>{copiedTokens ? 'Tokens Copied!' : 'Copy CSS Tokens'}</span>
          </button>

          <button className="btn btn-danger" onClick={resetTheme} title="Reset all theme overrides to default">
            <ThemeIcon name="trash" size={14} />
            <span>Reset Defaults</span>
          </button>
        </div>
      </div>

      {/* 1. Global Portal Layout Navigation Modes */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            1. Global Portal Layout Architecture
          </h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Active: <strong style={{ color: 'var(--accent-bright)' }}>{theme.layoutMode.toUpperCase()}</strong>
          </span>
        </div>

        <div className="theme-presets-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
          {layouts.map((l) => {
            const isSelected = theme.layoutMode === l.id;
            return (
              <div
                key={l.id}
                onClick={() => setGlobalLayout(l.id)}
                style={{
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '1.25rem',
                  borderRadius: '8px',
                  backgroundColor: isSelected ? '#1B2421' : '#18181B',
                  border: isSelected ? '2px solid #10B981' : '1px solid #27272A',
                  boxShadow: isSelected
                    ? '0 0 0 1px rgba(16, 185, 129, 0.35), 0 8px 24px -4px rgba(0, 0, 0, 0.8)'
                    : 'none',
                  transition: 'all 0.18s ease-in-out',
                  position: 'relative',
                  transform: isSelected ? 'translateY(-2px)' : 'none',
                }}
                onMouseOver={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = '#3F3F46';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }
                }}
                onMouseOut={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = '#27272A';
                    e.currentTarget.style.transform = 'none';
                  }
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>{l.icon}</span>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: isSelected ? '#FAFAFA' : 'inherit' }}>
                      {l.title}
                    </h4>
                  </div>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      padding: '0.2rem 0.55rem',
                      borderRadius: '9999px',
                      backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                      color: isSelected ? '#34D399' : 'var(--text-muted)',
                      border: `1px solid ${isSelected ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
                    }}
                  >
                    {isSelected && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                    {isSelected ? 'ACTIVE' : l.badge}
                  </span>
                </div>

                <p style={{ fontSize: '0.8rem', color: isSelected ? '#D4D4D8' : 'var(--text-muted)', marginBottom: '1rem', flex: 1, lineHeight: 1.45 }}>
                  {l.description}
                </p>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: '0.75rem',
                    borderTop: `1px solid ${isSelected ? 'rgba(16, 185, 129, 0.25)' : '#27272A'}`,
                    marginTop: 'auto',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <span
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        backgroundColor: isSelected ? '#10B981' : '#52525B',
                        boxShadow: isSelected ? '0 0 8px #10B981' : 'none',
                        display: 'inline-block',
                      }}
                    />
                    <span
                      style={{
                        fontSize: '0.725rem',
                        fontWeight: isSelected ? 700 : 500,
                        color: isSelected ? '#34D399' : 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {isSelected ? 'CURRENTLY ACTIVE' : 'CLICK TO ACTIVATE'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Theme Presets Grid */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            2. Design System Presets
          </h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Active: <strong style={{ color: 'var(--accent-bright)' }}>{theme.preset.toUpperCase()}</strong>
          </span>
        </div>

        <div className="theme-presets-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
          {presets.map((p) => {
            const isSelected = theme.preset === p.id;
            return (
              <div
                key={p.id}
                onClick={() => setPreset(p.id)}
                style={{
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '1.25rem',
                  borderRadius: '8px',
                  backgroundColor: isSelected ? '#1B2421' : '#18181B',
                  border: isSelected ? '2px solid #10B981' : '1px solid #27272A',
                  boxShadow: isSelected
                    ? '0 0 0 1px rgba(16, 185, 129, 0.35), 0 8px 24px -4px rgba(0, 0, 0, 0.8)'
                    : 'none',
                  transition: 'all 0.18s ease-in-out',
                  position: 'relative',
                  transform: isSelected ? 'translateY(-2px)' : 'none',
                }}
                onMouseOver={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = '#3F3F46';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }
                }}
                onMouseOut={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = '#27272A';
                    e.currentTarget.style.transform = 'none';
                  }
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>{p.icon}</span>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: isSelected ? '#FAFAFA' : 'inherit' }}>
                      {p.title}
                    </h4>
                  </div>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      padding: '0.2rem 0.55rem',
                      borderRadius: '9999px',
                      backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                      color: isSelected ? '#34D399' : 'var(--text-muted)',
                      border: `1px solid ${isSelected ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
                    }}
                  >
                    {isSelected && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                    {isSelected ? 'ACTIVE' : p.badge}
                  </span>
                </div>

                <p style={{ fontSize: '0.8rem', color: isSelected ? '#D4D4D8' : 'var(--text-muted)', marginBottom: '1rem', flex: 1, lineHeight: 1.45 }}>
                  {p.description}
                </p>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: '0.75rem',
                    borderTop: `1px solid ${isSelected ? 'rgba(16, 185, 129, 0.25)' : '#27272A'}`,
                    marginTop: 'auto',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <span
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        backgroundColor: isSelected ? '#10B981' : '#52525B',
                        boxShadow: isSelected ? '0 0 8px #10B981' : 'none',
                        display: 'inline-block',
                      }}
                    />
                    <span
                      style={{
                        fontSize: '0.725rem',
                        fontWeight: isSelected ? 700 : 500,
                        color: isSelected ? '#34D399' : 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {isSelected ? 'CURRENTLY APPLIED' : 'CLICK TO APPLY'}
                    </span>
                  </div>

                  <div
                    style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      background: p.bgPreview,
                      border: `2px solid ${p.borderPreview}`,
                    }}
                    title={`Background: ${p.bgPreview} | Border: ${p.borderPreview}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Mode & Enterprise Iconography Controls */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.5rem',
          marginBottom: '2rem',
        }}
      >
        {/* Color Mode & High-Contrast Switch */}
        <div className="glass-card">
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '1rem', textTransform: 'uppercase' }}>
            3A. Mode & Lighting
          </h3>

          {/* Light / Dark Mode */}
          <div className="form-group">
            <label className="form-label">Color Mode</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className={`btn btn-sm ${theme.mode === 'dark' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                onClick={() => setMode('dark')}
              >
                <ThemeIcon name="moon" size={14} />
                <span>Dark Mode</span>
              </button>
              <button
                className={`btn btn-sm ${theme.mode === 'light' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                onClick={() => setMode('light')}
              >
                <ThemeIcon name="sun" size={14} />
                <span>Light Mode</span>
              </button>
            </div>
            <div className="form-hint" style={{ marginTop: '0.5rem' }}>
              Seamlessly reconfigures all backgrounds, borders, card elevations, and icon stroke contrasts without white-on-white washouts.
            </div>
          </div>

          {/* Border Radius */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Corner Geometry (Border Radius)</label>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {radiusOptions.map((r) => (
                <button
                  key={r.id}
                  className={`btn btn-sm ${theme.radius === r.id ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, fontSize: '0.75rem' }}
                  onClick={() => setRadius(r.id)}
                >
                  {r.label} ({r.px})
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Enterprise Monochromatic Iconography Suite */}
        <div className="glass-card">
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '1rem', textTransform: 'uppercase' }}>
            3B. Enterprise Monochromatic Iconography
          </h3>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Icon Glyphs & Vector Engine</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {iconStyles.map((style) => {
                const isSelected = theme.iconStyle === style.id;
                return (
                  <button
                    key={style.id}
                    className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ justifyContent: 'space-between', padding: '0.55rem 0.85rem' }}
                    onClick={() => setIconStyle(style.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <ThemeIcon name="lightning" size={14} />
                      <span style={{ fontWeight: 600 }}>{style.label}</span>
                    </div>
                    <span className={`badge ${isSelected ? 'badge-cyan' : 'badge-muted'}`} style={{ fontSize: '0.65rem' }}>
                      {style.badge}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="form-hint" style={{ marginTop: '0.5rem' }}>
              Modern and retro emojis have been replaced with high-end vector enterprise stroke sets that dynamically adapt to theme contrast.
            </div>
          </div>
        </div>
      </div>

      {/* 4. Accent Color & Harmonious Multi-Color Palettes */}
      <div className="glass-card" style={{ marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          4. Accent Color & Harmonious Palettes
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '2rem' }}>
          {/* Part A: Single Color Choices */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <label className="form-label" style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem' }}>
                A. Single Color Presets
              </label>
              <span className="badge badge-cyan" style={{ fontSize: '0.65rem' }}>
                Active: {theme.accent.toUpperCase()}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {accentCategories.map((cat) => (
                <div key={cat.category}>
                  <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                    {cat.category}
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.35rem' }}>
                    {cat.colors.map((acc) => {
                      const isSelected = theme.accent === acc.id && theme.palette === 'custom';
                      return (
                        <button
                          key={acc.id}
                          className="btn btn-sm"
                          style={{
                            background: isSelected ? acc.color : 'var(--bg-input)',
                            color: isSelected ? (acc.id === 'yellow' || acc.id === 'mono' || acc.id === 'lime' ? '#000' : '#FFF') : 'var(--text-primary)',
                            border: isSelected ? `2px solid ${acc.color}` : '1px solid var(--border-subtle)',
                            fontSize: '0.725rem',
                            padding: '0.35rem 0.5rem',
                            justifyContent: 'flex-start',
                          }}
                          onClick={() => setAccent(acc.id)}
                        >
                          <div
                            style={{
                              width: '10px',
                              height: '10px',
                              borderRadius: '50%',
                              background: acc.color,
                              marginRight: '6px',
                              border: acc.id === 'mono' ? '1px solid #999' : 'none',
                            }}
                          />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {acc.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Part B: Harmonious Multi-Color Palettes */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <label className="form-label" style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem' }}>
                B. Harmonious Multi-Color Palettes
              </label>
              <span className="badge badge-emerald" style={{ fontSize: '0.65rem' }}>
                {theme.palette === 'custom' ? 'CUSTOM ACCENT' : theme.palette.toUpperCase()}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {palettes.map((pal) => {
                const isSelected = theme.palette === pal.id;
                return (
                  <div
                    key={pal.id}
                    className={`glass-card ${isSelected ? 'card-active' : ''}`}
                    style={{
                      padding: '0.85rem 1rem',
                      cursor: 'pointer',
                      border: isSelected ? '2px solid var(--accent-bright)' : '1px solid var(--border-subtle)',
                      background: isSelected ? 'var(--bg-elevated)' : 'var(--bg-input)',
                      borderRadius: 'var(--radius-md)',
                      transition: 'all 0.15s ease',
                    }}
                    onClick={() => setPalette(pal.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                        {pal.title}
                      </span>

                      {/* 3 or 4 Swatch Dots */}
                      <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                        {pal.colors.map((c, idx) => (
                          <div
                            key={idx}
                            style={{
                              width: '14px',
                              height: '14px',
                              borderRadius: '50%',
                              background: c,
                              border: '1px solid rgba(255,255,255,0.2)',
                            }}
                            title={`Color ${idx + 1}: ${c}`}
                          />
                        ))}
                      </div>
                    </div>

                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                      {pal.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
