import { ScreenId, NavigationAction } from "../navigation/index";
import type { ScreenView, NavigationDispatcher } from "./base-screen";

export class TutorialScreenView implements ScreenView {
  public readonly id = ScreenId.TUTORIAL;
  private container: HTMLElement | null = null;
  private readonly dispatch: NavigationDispatcher;

  constructor(dispatch: NavigationDispatcher) {
    this.dispatch = dispatch;
  }

  public mount(parent: HTMLElement): void {
    if (this.container) return;

    const screen = document.createElement("section");
    screen.id = "cv-tutorial-screen";
    screen.setAttribute("data-screen-id", this.id);

    const style = document.createElement("style");
    style.textContent = `
      #cv-tutorial-screen {
        position: fixed !important;
        inset: 0 !important;
        z-index: 2147483640 !important;
        display: none;
        flex-direction: column;
        justify-content: space-between;
        align-items: center;
        padding: 30px 24px 24px;
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background-color: #0b0f17;
        color: #f8fafc;
        overflow-y: auto;
        overflow-x: hidden;
        pointer-events: auto !important;
      }

      /* Grecas culturales sin bloqueo de clics */
      .cv-tut-greca {
        position: fixed !important;
        left: 0 !important;
        right: 0 !important;
        height: 22px !important;
        background-image: url("/assets/OJODEDIOSCHAQUIRABAJAOYARRIBA.PNG");
        background-repeat: repeat-x;
        background-size: auto 22px;
        z-index: 10 !important;
        pointer-events: none !important;
      }
      .cv-tut-greca.top { top: 0 !important; }
      .cv-tut-greca.bottom { bottom: 0 !important; }

      /* Cabecera con botón de regreso */
      .cv-tut-header {
        width: 100%;
        max-width: 820px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        z-index: 30;
        margin-bottom: 8px;
      }

      .cv-tut-back-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #f8fafc;
        padding: 6px 14px;
        border-radius: 20px;
        font-size: 0.78rem;
        cursor: pointer !important;
        display: flex;
        align-items: center;
        gap: 6px;
        transition: background 0.2s ease, transform 0.15s ease;
        pointer-events: auto !important;
      }
      .cv-tut-back-btn:hover {
        background: rgba(255, 255, 255, 0.18);
        transform: translateX(-2px);
      }

      .cv-tut-brand-box {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .cv-tut-logo {
        width: 24px;
        height: 24px;
        object-fit: contain;
      }
      .cv-tut-brand {
        font-size: 0.76rem;
        font-weight: 700;
        letter-spacing: 0.2em;
        color: #94a3b8;
        text-transform: uppercase;
      }

      /* Contenedor central (Grid de 2 pasos) */
      .cv-tut-body {
        width: 100%;
        max-width: 820px;
        display: flex;
        flex-direction: column;
        align-items: center;
        margin: auto 0;
        z-index: 20;
      }

      .cv-tut-grid {
        width: 100%;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        margin-bottom: 22px;
      }

      @media (max-width: 680px) {
        .cv-tut-grid {
          grid-template-columns: 1fr;
          gap: 16px;
        }
      }

      .cv-tut-card {
        background: rgba(22, 27, 34, 0.85);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 18px;
        padding: 16px 18px;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        backdrop-filter: blur(10px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
      }

      .cv-tut-step-badge {
        font-size: 0.82rem;
        font-weight: 700;
        color: #fbbf24;
        margin-bottom: 6px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .cv-tut-step-desc {
        font-size: 0.8rem;
        color: #cbd5e1;
        margin-bottom: 14px;
        line-height: 1.35;
      }

      .cv-tut-preview-box {
        width: 100%;
        height: 140px;
        border-radius: 12px;
        background: rgba(15, 23, 42, 0.6);
        border: 1px dashed rgba(255, 255, 255, 0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        overflow: hidden;
      }

      .cv-tut-asset-img {
        max-height: 115px;
        max-width: 85%;
        object-fit: contain;
        filter: drop-shadow(0 6px 14px rgba(0,0,0,0.6));
      }

      .cv-tut-rotate-pill {
        position: absolute;
        bottom: 10px;
        background: rgba(0, 0, 0, 0.65);
        border: 1px solid rgba(255, 255, 255, 0.2);
        padding: 4px 10px;
        border-radius: 20px;
        font-size: 0.7rem;
        color: #f59e0b;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .cv-tut-center-guide {
        position: absolute;
        top: 0;
        bottom: 0;
        left: 50%;
        width: 2px;
        background: rgba(244, 63, 94, 0.7);
        transform: translateX(-50%);
        pointer-events: none;
      }

      /* Contenedor de acciones inferiores */
      .cv-tut-action-wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
        max-width: 380px;
        z-index: 30;
        gap: 8px;
      }

      .cv-btn-start-vr {
        width: 100%;
        padding: 0.95rem 1.6rem;
        border-radius: 16px;
        border: none;
        background: linear-gradient(135deg, #be185d 0%, #e11d48 100%);
        color: #ffffff;
        font-size: 0.95rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        cursor: pointer !important;
        pointer-events: auto !important;
        box-shadow: 0 6px 20px rgba(190, 24, 93, 0.45);
        transition: transform 0.15s ease, filter 0.15s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
      }
      .cv-btn-start-vr:hover {
        transform: translateY(-2px);
        filter: brightness(1.1);
      }
      .cv-btn-start-vr:active {
        transform: scale(0.98);
      }

      .cv-btn-switch-touch {
        background: transparent;
        border: none;
        color: #2dd4bf;
        font-size: 0.78rem;
        cursor: pointer !important;
        pointer-events: auto !important;
        text-decoration: underline;
        padding: 4px;
        transition: color 0.15s ease;
      }
      .cv-btn-switch-touch:hover {
        color: #5eead4;
      }
    `;
    screen.appendChild(style);

    const grecaTop = document.createElement("div");
    grecaTop.className = "cv-tut-greca top";
    const grecaBottom = document.createElement("div");
    grecaBottom.className = "cv-tut-greca bottom";

    const header = document.createElement("div");
    header.className = "cv-tut-header";

    const backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className = "cv-tut-back-btn";
    backBtn.innerHTML = "← Volver a inicio";
    backBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.goToWelcome();
    });

    const brandBox = document.createElement("div");
    brandBox.className = "cv-tut-brand-box";
    brandBox.innerHTML = `
      <img class="cv-tut-logo" src="/assets/cabezavenado-removebg-preview.png" alt="Logo" />
      <span class="cv-tut-brand">CULTURAS VIVAS</span>
    `;

    header.append(backBtn, brandBox);

    const body = document.createElement("div");
    body.className = "cv-tut-body";

    const grid = document.createElement("div");
    grid.className = "cv-tut-grid";

    // Paso 1
    const card1 = document.createElement("div");
    card1.className = "cv-tut-card";
    card1.innerHTML = `
      <div class="cv-tut-step-badge">1. Coloca tu teléfono</div>
      <div class="cv-tut-step-desc">Gira tu dispositivo a posición horizontal e insértalo en tu visor Cardboard.</div>
      <div class="cv-tut-preview-box">
        <img class="cv-tut-asset-img" src="/assets/venado-removebg-preview.png" alt="Venado" />
        <div class="cv-tut-rotate-pill">↻ Girar horizontal</div>
      </div>
    `;

    // Paso 2
    const card2 = document.createElement("div");
    card2.className = "cv-tut-card";
    card2.innerHTML = `
      <div class="cv-tut-step-badge">2. Centra la imagen</div>
      <div class="cv-tut-step-desc">Ajusta el divisor central de la pantalla con la marca divisoria de los lentes.</div>
      <div class="cv-tut-preview-box">
        <img class="cv-tut-asset-img" src="/assets/SEÑOR.png" alt="Sabio con visor" />
        <div class="cv-tut-center-guide"></div>
      </div>
    `;

    grid.append(card1, card2);

    const actionWrap = document.createElement("div");
    actionWrap.className = "cv-tut-action-wrap";

    // Botón Iniciar Experiencia
    const startBtn = document.createElement("button");
    startBtn.type = "button";
    startBtn.className = "cv-btn-start-vr";
    startBtn.innerHTML = `
      <span>Iniciar Experiencia VR</span>
      <span style="font-size: 1.15rem;">🥽</span>
    `;
    startBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.startExperience();
    });

    // Botón Cambiar a Modo Táctil
    const switchTouchBtn = document.createElement("button");
    switchTouchBtn.type = "button";
    switchTouchBtn.className = "cv-btn-switch-touch";
    switchTouchBtn.textContent = "¿No tienes visor? Entrar en Modo Táctil (2D)";
    switchTouchBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.startExperience();
    });

    actionWrap.append(startBtn, switchTouchBtn);
    body.append(grid, actionWrap);

    screen.append(grecaTop, grecaBottom, header, body);
    parent.appendChild(screen);
    this.container = screen;
  }

  private startExperience(): void {
    // 1. Ocultar tutorial
    this.hide();

    // 2. Intentar transición por dispatcher
    try {
      this.dispatch(NavigationAction.CONFIRM_INSERTION);
    } catch {
      // Ignorar si la máquina de estados falló
    }

    // 3. Forzar visualización de la escena 3D y habilitar eventos del canvas
    const expEl = document.querySelector<HTMLElement>('[data-screen-id="EXPERIENCE_3D"], .cv-screen--experience');
    if (expEl) {
      expEl.style.removeProperty("display");
      expEl.style.display = "flex";
      expEl.classList.remove("cv-screen--hidden");
      expEl.classList.add("cv-screen--active");
    }

    const aframeCanvas = document.querySelector<HTMLCanvasElement>(".a-canvas, a-scene canvas");
    if (aframeCanvas) {
      aframeCanvas.style.pointerEvents = "auto";
    }
  }

  private goToWelcome(): void {
    this.hide();

    try {
      this.dispatch(NavigationAction.SWITCH_TO_TOUCH);
    } catch {
      // Ignorar si falló
    }

    const welcomeEl = document.querySelector<HTMLElement>('[data-screen-id="WELCOME"], #cv-welcome-screen');
    if (welcomeEl) {
      welcomeEl.style.removeProperty("display");
      welcomeEl.style.display = "flex";
      welcomeEl.style.pointerEvents = "auto";
    }
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
    }
  }

  public getElement(): HTMLElement | null {
    return this.container;
  }
}