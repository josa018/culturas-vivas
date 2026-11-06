import { ScreenId, NavigationAction } from "../navigation/index";
import type { ScreenView, NavigationDispatcher } from "./base-screen";

export type CultureKey = "wixarika" | "naayeri" | "odam" | "mexicanero";

interface CultureCardData {
  culture: CultureKey;
  title: string;
  sub: string;
  region: string;
  desc: string;
  icon: string;
  gradient: string;
  accent: string;
}

const CULTURES_DATA: CultureCardData[] = [
  {
    culture: "wixarika",
    title: "Wixárika",
    sub: "Huicholes",
    region: "SIERRA MADRE OCCIDENTAL",
    desc: "Cosmovisión sagrada, arte en chaquira, tablas de estambre (nierika) y el culto al venado Kauyumari.",
    icon: "🦌",
    gradient: "linear-gradient(135deg, #be185d 0%, #e11d48 100%)",
    accent: "rgba(225, 29, 72, 0.25)",
  },
  {
    culture: "naayeri",
    title: "Náayeri",
    sub: "Coras",
    region: "EL NAYAR",
    desc: "Tradición guerrera, la monumental Judea de Semana Santa, alfarería y mitología de la estrella de la mañana.",
    icon: "🏹",
    gradient: "linear-gradient(135deg, #0f766e 0%, #0d9488 100%)",
    accent: "rgba(13, 148, 136, 0.25)",
  },
  {
    culture: "odam",
    title: "O'dam",
    sub: "Tepehuanos del Sur",
    region: "HUAJICORI Y SERRANÍAS",
    desc: "Ceremonias ancestrales del Mitote, cantos agrarios, telar de cintura y profunda devoción a la tierra.",
    icon: "🌽",
    gradient: "linear-gradient(135deg, #b45309 0%, #f59e0b 100%)",
    accent: "rgba(245, 158, 11, 0.25)",
  },
  {
    culture: "mexicanero",
    title: "Mexicanero",
    sub: "Nahuas de la Sierra",
    region: "COMUNIDADES SERRANAS",
    desc: "Guardianes de la variante náhuatl serrana viva, tradición de danzas rituales y medicina tradicional botánica.",
    icon: "🦅",
    gradient: "linear-gradient(135deg, #4338ca 0%, #6366f1 100%)",
    accent: "rgba(99, 102, 241, 0.25)",
  },
];

export class CultureSelectScreenView implements ScreenView {
  public readonly id = ScreenId.CULTURE_SELECT;
  private container: HTMLElement | null = null;
  private readonly dispatch: NavigationDispatcher;

  constructor(dispatch: NavigationDispatcher) {
    this.dispatch = dispatch;
  }

  public mount(parent: HTMLElement): void {
    if (this.container) return;

    const screen = document.createElement("section");
    screen.id = "cv-culture-select-screen";
    screen.setAttribute("data-screen-id", this.id);

    const style = document.createElement("style");
    style.textContent = `
      #cv-culture-select-screen {
        position: fixed !important;
        inset: 0 !important;
        z-index: 9999 !important;
        pointer-events: auto !important;
        display: none;
        flex-direction: column;
        justify-content: flex-start;
        align-items: center;
        padding: 34px 20px 30px;
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background-color: #0b0f17;
        color: #f8fafc;
        overflow-y: auto;
        overflow-x: hidden;
      }

      .cv-select-greca {
        position: fixed;
        left: 0;
        right: 0;
        height: 22px;
        background-image: url("/assets/OJODEDIOSCHAQUIRABAJAOYARRIBA.PNG");
        background-repeat: repeat-x;
        background-size: auto 22px;
        z-index: 10000;
        pointer-events: none !important;
      }
      .cv-select-greca.top { top: 0; }
      .cv-select-greca.bottom { bottom: 0; }

      .cv-select-header {
        width: 100%;
        max-width: 900px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.2rem;
        z-index: 10001;
        pointer-events: auto;
      }

      .cv-btn-back-mode {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.16);
        color: #f8fafc;
        border-radius: 999px;
        padding: 0.45rem 1rem;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer !important;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        pointer-events: auto !important;
        transition: background 0.15s ease, transform 0.15s ease;
      }
      .cv-btn-back-mode:hover {
        background: rgba(255, 255, 255, 0.18);
        transform: translateX(-2px);
      }

      .cv-brand-tag {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.76rem;
        font-weight: 700;
        letter-spacing: 0.2em;
        color: #94a3b8;
        text-transform: uppercase;
      }
      .cv-brand-tag img {
        width: 22px;
        height: 22px;
        object-fit: contain;
      }

      .cv-select-title-box {
        text-align: center;
        max-width: 650px;
        margin-bottom: 2rem;
        z-index: 10001;
        pointer-events: none;
      }
      .cv-select-title {
        font-size: 1.85rem;
        font-weight: 800;
        margin: 0 0 0.4rem;
        color: #f8fafc;
      }
      .cv-select-title span {
        color: #f59e0b;
      }
      .cv-select-subtitle {
        font-size: 0.92rem;
        color: #94a3b8;
        margin: 0;
      }

      .cv-cards-grid {
        width: 100%;
        max-width: 900px;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
        gap: 20px;
        z-index: 10001;
        margin-bottom: 2rem;
        pointer-events: auto;
      }

      .cv-culture-card {
        background: rgba(22, 27, 34, 0.92);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 20px;
        padding: 20px 22px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 14px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(8px);
        pointer-events: auto !important;
        transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
      }
      .cv-culture-card:hover {
        transform: translateY(-4px);
        border-color: rgba(255, 255, 255, 0.28);
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.7);
      }

      .cv-card-top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      }
      .cv-card-icon-box {
        width: 44px;
        height: 44px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.4rem;
      }
      .cv-card-region {
        font-size: 0.65rem;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        border-radius: 999px;
        padding: 4px 10px;
        border: 1px solid currentColor;
      }

      .cv-card-body h3 {
        font-size: 1.45rem;
        font-weight: 800;
        margin: 0 0 2px;
        color: #f8fafc;
      }
      .cv-card-body .cv-card-sub {
        font-size: 0.8rem;
        color: #94a3b8;
        font-weight: 500;
        margin-bottom: 8px;
        display: block;
      }
      .cv-card-body p {
        font-size: 0.82rem;
        line-height: 1.45;
        color: #cbd5e1;
        margin: 0;
      }

      .cv-btn-explore {
        width: 100%;
        padding: 0.75rem 1rem;
        border-radius: 12px;
        border: none;
        color: #ffffff;
        font-size: 0.88rem;
        font-weight: 700;
        cursor: pointer !important;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        pointer-events: auto !important;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
        transition: transform 0.15s ease, filter 0.15s ease;
      }
      .cv-btn-explore:hover {
        transform: translateY(-2px);
        filter: brightness(1.1);
      }
      .cv-btn-explore:active {
        transform: scale(0.98);
      }

      @media (max-width: 768px) {
        .cv-cards-grid {
          grid-template-columns: 1fr;
        }
      }
    `;
    screen.appendChild(style);

    const grecaTop = document.createElement("div");
    grecaTop.className = "cv-select-greca top";
    const grecaBottom = document.createElement("div");
    grecaBottom.className = "cv-select-greca bottom";

    const header = document.createElement("header");
    header.className = "cv-select-header";

    const backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className = "cv-btn-back-mode";
    backBtn.innerHTML = "← Cambiar Modo";
    backBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dispatch(NavigationAction.BACK_TO_WELCOME);
    });

    const brandTag = document.createElement("div");
    brandTag.className = "cv-brand-tag";
    brandTag.innerHTML = `
      <img src="/assets/cabezavenado-removebg-preview.png" alt="Logo" />
      <span>CULTURAS VIVAS</span>
    `;

    header.append(backBtn, brandTag);

    const titleBox = document.createElement("div");
    titleBox.className = "cv-select-title-box";
    titleBox.innerHTML = `
      <h1 class="cv-select-title">Pabellón de <span>Culturas Originarias</span></h1>
      <p class="cv-select-subtitle">Selecciona el pueblo originario de Nayarit que deseas explorar en el museo:</p>
    `;

    const cardsGrid = document.createElement("div");
    cardsGrid.className = "cv-cards-grid";

    CULTURES_DATA.forEach((item) => {
      const card = document.createElement("article");
      card.className = "cv-culture-card";

      const cardTop = document.createElement("div");
      cardTop.className = "cv-card-top";
      cardTop.innerHTML = `
        <div class="cv-card-icon-box">${item.icon}</div>
        <span class="cv-card-region" style="color: ${item.accent}; background: rgba(255,255,255,0.03);">${item.region}</span>
      `;

      const cardBody = document.createElement("div");
      cardBody.className = "cv-card-body";
      cardBody.innerHTML = `
        <h3>${item.title}</h3>
        <span class="cv-card-sub">${item.sub}</span>
        <p>${item.desc}</p>
      `;

      const exploreBtn = document.createElement("button");
      exploreBtn.type = "button";
      exploreBtn.className = "cv-btn-explore";
      exploreBtn.style.background = item.gradient;
      exploreBtn.innerHTML = `Explorar Sala <span>→</span>`;
      exploreBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dispatch(NavigationAction.CHOOSE_CULTURE, {
          selectedCulture: item.culture,
        } as any);
      });

      card.append(cardTop, cardBody, exploreBtn);
      cardsGrid.appendChild(card);
    });

    screen.append(grecaTop, grecaBottom, header, titleBox, cardsGrid);
    parent.appendChild(screen);
    this.container = screen;
  }

  public unmount(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }

  public show(): void {
    if (this.container) {
      this.container.style.removeProperty("display");
      this.container.style.display = "flex";
      this.container.style.pointerEvents = "auto";
    }
  }

  public hide(): void {
    if (this.container) {
      this.container.style.display = "none";
      this.container.style.pointerEvents = "none";
    }
  }

  public getElement(): HTMLElement | null {
    return this.container;
  }
}