const encodeSvgToBase64DataUri = (svgString: string): string => {
  const globalRef = globalThis as unknown as {
    Buffer?: {
      from: (str: string, enc: string) => { toString: (enc: string) => string };
    };
  };
  const base64 =
    typeof globalRef.Buffer !== "undefined"
      ? globalRef.Buffer.from(svgString, "utf-8").toString("base64")
      : globalThis.btoa(svgString);
  return `data:image/svg+xml;base64,${base64}`;
};

export class PlaceholderAssetGenerator {
  public static createPaintingTexture(): string {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
        <rect width="512" height="512" fill="#1e1e24" />
        <rect x="24" y="24" width="464" height="464" fill="none" stroke="#d4af37" stroke-width="8" rx="8" />
        <rect x="44" y="44" width="424" height="424" fill="#2a2a36" />
        <circle cx="256" cy="220" r="100" fill="#e07a5f" opacity="0.8" />
        <polygon points="256,120 330,300 182,300" fill="#81b29a" opacity="0.85" />
        <circle cx="256" cy="220" r="40" fill="#f2cc8f" />
        <text x="256" y="400" font-family="sans-serif" font-size="28" font-weight="bold" fill="#ffffff" text-anchor="middle">
          LIENZO 2D
        </text>
        <text x="256" y="430" font-family="sans-serif" font-size="16" fill="#a0a0a0" text-anchor="middle">
          Textura Monocanal Estandar
        </text>
      </svg>
    `.trim();
    return encodeSvgToBase64DataUri(svg);
  }

  public static createStereoImageTexture(): string {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="512" viewBox="0 0 1024 512">
        <!-- Background -->
        <rect width="1024" height="512" fill="#121212" />
        
        <!-- Left Eye Frame (U: 0.0 - 0.5) -->
        <rect x="16" y="16" width="480" height="480" fill="#1a2634" stroke="#4cc9f0" stroke-width="6" rx="8" />
        <circle cx="240" cy="220" r="90" fill="#4361ee" opacity="0.85" />
        <polygon points="240,130 310,290 170,290" fill="#4cc9f0" opacity="0.9" />
        <text x="256" y="380" font-family="sans-serif" font-size="32" font-weight="bold" fill="#4cc9f0" text-anchor="middle">
          OJO IZQUIERDO [L]
        </text>
        <text x="256" y="420" font-family="sans-serif" font-size="20" fill="#ffffff" text-anchor="middle">
          Estereo Half-SBS (Canal 1)
        </text>

        <!-- Center Divider -->
        <line x1="512" y1="0" x2="512" y2="512" stroke="#ffffff" stroke-width="4" stroke-dasharray="12,12" opacity="0.4" />

        <!-- Right Eye Frame (U: 0.5 - 1.0) with subtle disparity shift -->
        <rect x="528" y="16" width="480" height="480" fill="#341a22" stroke="#f72585" stroke-width="6" rx="8" />
        <circle cx="784" cy="220" r="90" fill="#b5179e" opacity="0.85" />
        <polygon points="784,130 854,290 714,290" fill="#f72585" opacity="0.9" />
        <text x="768" y="380" font-family="sans-serif" font-size="32" font-weight="bold" fill="#f72585" text-anchor="middle">
          OJO DERECHO [R]
        </text>
        <text x="768" y="420" font-family="sans-serif" font-size="20" fill="#ffffff" text-anchor="middle">
          Estereo Half-SBS (Canal 2)
        </text>
      </svg>
    `.trim();
    return encodeSvgToBase64DataUri(svg);
  }

  public static createVideoThumbnailTexture(): string {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
        <rect width="512" height="512" fill="#0f141c" />
        <rect x="20" y="20" width="472" height="472" fill="#1b2432" stroke="#2ec4b6" stroke-width="6" rx="10" />
        <circle cx="256" cy="220" r="80" fill="#2ec4b6" opacity="0.2" />
        <polygon points="230,175 305,220 230,265" fill="#2ec4b6" />
        <text x="256" y="370" font-family="sans-serif" font-size="28" font-weight="bold" fill="#ffffff" text-anchor="middle">
          VIDEO 2D ESTANDAR
        </text>
        <text x="256" y="410" font-family="sans-serif" font-size="18" fill="#2ec4b6" text-anchor="middle">
          Reproduce al Enfocar
        </text>
      </svg>
    `.trim();
    return encodeSvgToBase64DataUri(svg);
  }

  public static createStereoVideoThumbnailTexture(): string {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="512" viewBox="0 0 1024 512">
        <rect width="1024" height="512" fill="#0d1117" />
        
        <!-- Left Eye Video (U: 0.0 - 0.5) -->
        <rect x="16" y="16" width="480" height="480" fill="#161b22" stroke="#38bdf8" stroke-width="6" rx="8" />
        <polygon points="230,185 295,225 230,265" fill="#38bdf8" />
        <text x="256" y="360" font-family="sans-serif" font-size="30" font-weight="bold" fill="#38bdf8" text-anchor="middle">
          VIDEO SBS [L]
        </text>
        <text x="256" y="405" font-family="sans-serif" font-size="18" fill="#ffffff" text-anchor="middle">
          Canal Izquierdo
        </text>

        <!-- Divider -->
        <line x1="512" y1="0" x2="512" y2="512" stroke="#ffffff" stroke-width="4" stroke-dasharray="10,10" opacity="0.3" />

        <!-- Right Eye Video (U: 0.5 - 1.0) -->
        <rect x="528" y="16" width="480" height="480" fill="#1f1622" stroke="#e879f9" stroke-width="6" rx="8" />
        <polygon points="742,185 807,225 742,265" fill="#e879f9" />
        <text x="768" y="360" font-family="sans-serif" font-size="30" font-weight="bold" fill="#e879f9" text-anchor="middle">
          VIDEO SBS [R]
        </text>
        <text x="768" y="405" font-family="sans-serif" font-size="18" fill="#ffffff" text-anchor="middle">
          Canal Derecho
        </text>
      </svg>
    `.trim();
    return encodeSvgToBase64DataUri(svg);
  }
}
