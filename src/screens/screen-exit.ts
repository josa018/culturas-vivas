import { ScreenId, NavigationAction } from "../navigation/index";
import type { ScreenView, NavigationDispatcher } from "./base-screen";

export class ExitModalScreenView implements ScreenView {
  public readonly id = ScreenId.EXIT_MODAL;
  private container: HTMLElement | null = null;
  private readonly dispatch: NavigationDispatcher;

  constructor(dispatch: NavigationDispatcher) {
    this.dispatch = dispatch;
  }

  public mount(parent: HTMLElement): void {
    if (this.container) return;

    const backdrop = document.createElement("div");
    backdrop.id = "cv-exit-modal-screen";
    backdrop.setAttribute("data-screen-id", this.id);
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");

    const style = document.createElement("style");
    style.textContent = `
      #cv-exit-modal-screen {
        position: fixed !important;
        inset: 0 !important;
        z-index: 2147483647 !important; /* Capa máxima sobre A-Frame */
        display: none;
        align-items: center;
        justify-content: center;
        padding: 30px 16px;
        box-sizing: border-box;
        background: rgba(11, 15, 23, 0.85);
        backdrop-filter: blur(10px);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #f8fafc;
        pointer-events: auto !important;
      }

      .cv-modal-greca {
        position: fixed;
        left: 0;
        right: 0;
        height: 22px;
        background-image: url("/assets/OJODEDIOSCHAQUIRABAJAOYARRIBA.PNG");
        background-repeat: repeat-x;
        background-size: auto 22px;
        z-index: 10;
        pointer-events: none;
      }
      .cv-modal-greca.top { top: 0; }
      .cv-modal-greca.bottom { bottom: 0; }

      .cv-exit-card {
        width: 100%;
        max-width: 350px;
        background: rgba(22, 27, 34, 0.96);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 26px;
        padding: 24px 20px 20px;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.85);
        box-sizing: border-box;
        z-index: 20;
        position: relative;
        pointer-events: auto !important;
      }

      .cv-modal-icon-badge {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: rgba(245, 158, 11, 0.15);
        border: 1px solid rgba(245, 158, 11, 0.45);
        color: #fbbf24;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.1rem;
        margin-bottom: 12px;
        pointer-events: none;
      }

      .cv-modal-title {
        font-size: 1.35rem;
        font-weight: 800;
        line-height: 1.3;
        margin: 0 0 6px 0;
        color: #f8fafc;
        pointer-events: none;
      }

      .cv-modal-desc {
        font-size: 0.8rem;
        color: #94a3b8;
        margin: 0 0 20px 0;
        line-height: 1.4;
        pointer-events: none;
      }

      .cv-modal-btn-group {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 12px;
        z-index: 30;
      }

      .cv-btn-modal-resume {
        width: 100%;
        padding: 0.9rem 1.2rem;
        border-radius: 14px;
        border: none;
        background: linear-gradient(135deg, #be185d 0%, #e11d48 100%);
        color: #ffffff;
        font-size: 0.92rem;
        font-weight: 700;
        cursor: pointer !important;
        pointer-events: auto !important;
        box-shadow: 0 4px 14px rgba(190, 24, 93, 0.45);
        transition: transform 0.15s ease, filter 0.15s ease;
      }
      .cv-btn-modal-resume:hover {
        transform: translateY(-2px);
        filter: brightness(1.1);
      }
      .cv-btn-modal-resume:active {
        transform: scale(0.98);
      }

      .cv-btn-modal-exit {
        width: 100%;
        padding: 0.85rem 1.2rem;
        border-radius: 14px;
        border: 1px solid rgba(20, 184, 166, 0.6);
        background: rgba(13, 148, 136, 0.18);
        color: #2dd4bf;
        font-size: 0.9rem;
        font-weight: 700;
        cursor: pointer !important;
        pointer-events: auto !important;
        transition: background 0.15s ease, transform 0.15s ease;
      }
      .cv-btn-modal-exit:hover {
        background: rgba(13, 148, 136, 0.3);
        transform: translateY(-2px);
      }
      .cv-btn-modal-exit:active {
        transform: scale(0.98);
      }

      .cv-modal-footer-art {
        width: 130px;
        max-width: 45%;
        margin-top: 18px;
        object-fit: contain;
        filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.5));
        pointer-events: none;
      }
    `;
    backdrop.appendChild(style);

    const grecaTop = document.createElement("div");
    grecaTop.className = "cv-modal-greca top";
    const grecaBottom = document.createElement("div");
    grecaBottom.className = "cv-modal-greca bottom";

    const card = document.createElement("div");
    card.className = "cv-exit-card";

    const iconBadge = document.createElement("div");
    iconBadge.className = "cv-modal-icon-badge";
    iconBadge.innerHTML = "⏸";

    const title = document.createElement("h2");
    title.className = "cv-modal-title";
    title.textContent = "¿Deseas salir del recorrido?";

    const description = document.createElement("p");
    description.className = "cv-modal-desc";
    description.textContent = "Podrás completar una breve encuesta cultural antes de finalizar.";

    const btnGroup = document.createElement("div");
    btnGroup.className = "cv-modal-btn-group";

    // 1. Continuar Recorrido
    const resumeBtn = document.createElement("button");
    resumeBtn.type = "button";
    resumeBtn.className = "cv-btn-modal-resume";
    resumeBtn.textContent = "Continuar Recorrido";

    const handleResume = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.hide();
      this.dispatch(NavigationAction.RESUME_TOUR);
    };
    resumeBtn.onclick = handleResume;

    // 2. Finalizar Experiencia -> Encuesta / Salida
    const exitBtn = document.createElement("button");
    exitBtn.type = "button";
    exitBtn.className = "cv-btn-modal-exit";
    exitBtn.textContent = "Finalizar Experiencia";

    const handleExit = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.hide();
      this.dispatch(NavigationAction.CONFIRM_EXIT);

      // Fallback si la máquina de estados o el router no estuvieran cambiando la vista
      const surveyScreen = document.querySelector<HTMLElement>('[data-screen-id="SURVEY"], #cv-survey-screen');
      const experienceScreen = document.querySelector<HTMLElement>('[data-screen-id="EXPERIENCE_3D"], .cv-screen--experience');
      const welcomeScreen = document.querySelector<HTMLElement>('[data-screen-id="WELCOME"], #cv-welcome-screen');

      if (experienceScreen) {
        experienceScreen.style.display = "none";
      }

      if (surveyScreen) {
        surveyScreen.style.display = "flex";
      } else if (welcomeScreen) {
        welcomeScreen.style.display = "flex";
      }
    };
    exitBtn.onclick = handleExit;

    btnGroup.append(resumeBtn, exitBtn);

    const footerArt = document.createElement("img");
    footerArt.className = "cv-modal-footer-art";
    footerArt.src = "/assets/peyote-removebg-preview.png";
    footerArt.alt = "Arte Cultural Wixárika";

    card.append(iconBadge, title, description, btnGroup, footerArt);
    backdrop.append(grecaTop, grecaBottom, card);

    parent.appendChild(backdrop);
    this.container = backdrop;
  }

  public unmount(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }

  public show(): void {
    // 1. Forzar salida de pointer lock
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }

    // 2. Desactivar captura de clics en el canvas de A-Frame para que no robe los clics
    const aframeCanvas = document.querySelector<HTMLCanvasElement>(".a-canvas, a-scene canvas");
    if (aframeCanvas) {
      aframeCanvas.style.pointerEvents = "none";
    }

    if (this.container) {
      this.container.style.display = "flex";
    }
  }

  public hide(): void {
    // Restaurar los eventos del canvas de A-Frame
    const aframeCanvas = document.querySelector<HTMLCanvasElement>(".a-canvas, a-scene canvas");
    if (aframeCanvas) {
      aframeCanvas.style.pointerEvents = "auto";
    }

    if (this.container) {
      this.container.style.display = "none";
    }
  }

  public getElement(): HTMLElement | null {
    return this.container;
  }
}