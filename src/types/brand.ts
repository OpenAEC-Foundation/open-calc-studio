/**
 * BrandConfig — huisstijl configuratie voor rapporten en offertes.
 *
 * Gebaseerd op het OpenAEC Reports brand.yaml formaat.
 * Elke organisatie kan een eigen huisstijl instellen.
 */

export interface BrandConfig {
  brand: {
    name: string;
    slug: string;
  };

  colors: {
    primary: string;       // Hoofdkleur (bijv. #D97706 amber, #40124A paars)
    secondary: string;     // Secundair (bijv. #38BDA0 turquoise)
    text: string;          // Tekst kleur (#36363E)
    textAccent: string;    // Accent tekst (#56B49B)
    textLight: string;     // Lichte tekst (#7F8C8D)
    tableHeaderBg: string; // Tabel header achtergrond
    tableHeaderText: string; // Tabel header tekst
    separator: string;     // Scheidingslijnen
    accent: string;        // Extra accent (#2ECC71)
    warning: string;       // Waarschuwing (#E74C3C)
  };

  fonts: {
    heading: string;       // Font voor koppen (bijv. "GothamBold", "Inter-Bold")
    body: string;          // Font voor lopende tekst
    medium: string;        // Medium gewicht
    italic: string;        // Cursief
  };

  logos: {
    main: string | null;   // Pad naar hoofdlogo (PNG/SVG)
    white: string | null;  // Wit logo variant
    tagline: string | null; // Logo met tagline
  };

  contact: {
    name: string;          // Bedrijfsnaam
    address: string;       // Adres (vrij formaat)
    website: string;       // Website URL
    kvk: string;           // KvK nummer
    btw: string;           // BTW nummer
    iban: string;          // IBAN
  };

  header: {
    height: number;        // Hoogte in mm (0 = geen header)
  };

  footer: {
    height: number;        // Hoogte in mm
    text: string;          // Footer tekst (variabelen: {page}, {pages}, {date})
  };

  styles: {
    normal: { fontSize: number; leading: number };
    heading1: { fontSize: number; leading: number };
    heading2: { fontSize: number; leading: number };
    heading3: { fontSize: number; leading: number };
  };

  modules: {
    table: {
      headerBg: string;
      headerTextColor: string;
      bodyFontSize: number;
      gridColor: string;
    };
  };
}

/** OpenAEC Foundation default brand (amber huisstijl) */
export const defaultBrand: BrandConfig = {
  brand: { name: 'Bedrijfsnaam', slug: 'default' },
  colors: {
    primary: '#D97706',
    secondary: '#F59E0B',
    text: '#36363E',
    textAccent: '#D97706',
    textLight: '#A1A1AA',
    tableHeaderBg: '#FEF3C7',
    tableHeaderText: '#36363E',
    separator: '#E7E5E4',
    accent: '#16A34A',
    warning: '#DC2626',
  },
  fonts: { heading: 'Inter-Bold', body: 'Inter', medium: 'Inter-Medium', italic: 'Inter-Italic' },
  logos: { main: null, white: null, tagline: null },
  contact: { name: '', address: '', website: '', kvk: '', btw: '', iban: '' },
  header: { height: 0 },
  footer: { height: 12, text: 'Pagina {page} / {pages}' },
  styles: {
    normal: { fontSize: 9.5, leading: 12 },
    heading1: { fontSize: 18, leading: 23.4 },
    heading2: { fontSize: 13, leading: 16.9 },
    heading3: { fontSize: 11, leading: 14.3 },
  },
  modules: {
    table: { headerBg: '#FEF3C7', headerTextColor: '#36363E', bodyFontSize: 7.5, gridColor: '#E7E5E4' },
  },
};

/** Bouw 1 — neutral example brand for Dutch construction (groen) */
export const bouw1Brand: BrandConfig = {
  brand: { name: 'Bouw 1', slug: 'bouw1' },
  colors: {
    primary: '#1B4D3E',
    secondary: '#2E7D5B',
    text: '#1A1A1A',
    textAccent: '#2E7D5B',
    textLight: '#6B7280',
    tableHeaderBg: '#1B4D3E',
    tableHeaderText: '#FFFFFF',
    separator: '#D1D5DB',
    accent: '#16A34A',
    warning: '#DC2626',
  },
  fonts: { heading: 'Inter-Bold', body: 'Inter', medium: 'Inter-Medium', italic: 'Inter-Italic' },
  logos: { main: null, white: null, tagline: null },
  contact: {
    name: 'Bouw 1',
    address: '',
    website: '',
    kvk: '',
    btw: '',
    iban: '',
  },
  header: { height: 0 },
  footer: { height: 12, text: 'Pagina {page} / {pages}' },
  styles: {
    normal: { fontSize: 9.5, leading: 12 },
    heading1: { fontSize: 18, leading: 23.4 },
    heading2: { fontSize: 13, leading: 16.9 },
    heading3: { fontSize: 11, leading: 14.3 },
  },
  modules: {
    table: { headerBg: '#1B4D3E', headerTextColor: '#FFFFFF', bodyFontSize: 7.5, gridColor: '#D1D5DB' },
  },
};

/** All available brands */
export const availableBrands: BrandConfig[] = [defaultBrand, bouw1Brand];
