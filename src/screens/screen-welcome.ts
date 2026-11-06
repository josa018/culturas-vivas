import { ScreenId, NavigationAction } from "../navigation/index";
import type { ScreenView, NavigationDispatcher } from "./base-screen";

export class WelcomeScreenView implements ScreenView {
  public readonly id = ScreenId.WELCOME;
  private container: HTMLElement | null = null;
  private readonly dispatch: NavigationDispatcher;
  private isDarkMode: boolean = true;

  constructor(dispatch: NavigationDispatcher) {
    this.dispatch = dispatch;
  }

  public mount(parent: HTMLElement): void {
    if (this.container) return;

    const screen = document.createElement("section");
    screen.id = "cv-welcome-screen";
    screen.setAttribute("data-screen-id", this.id);

    const style = document.createElement("style");
    style.textContent = `
      #cv-welcome-screen {
        position: fixed;
        inset: 0;
        z-index: 100;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: center;
        padding: 34px 18px 24px;
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background-color: #0b0f17;
        color: #f8fafc;
        overflow-y: auto;
        overflow-x: hidden;
        transition: background 0.3s ease, color 0.3s ease;
      }

      /* Grecas superior e inferior */
      .cv-greca-bar {
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
      .cv-greca-bar.top { top: 0; }
      .cv-greca-bar.bottom { bottom: 0; }

      /* Venados laterales decorativos */
      .cv-bg-venado {
        position: absolute;
        top: 24%;
        width: 120px;
        max-width: 18vw;
        opacity: 0.88;
        z-index: 1;
        pointer-events: none;
        filter: drop-shadow(0 6px 18px rgba(0,0,0,0.6));
      }
      .cv-bg-venado.left { left: 4%; }
      .cv-bg-venado.right { right: 4%; }

      /* Barra superior */
      .cv-top-nav {
        width: 100%;
        max-width: 380px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        z-index: 20;
        margin-bottom: 0.5rem;
      }
      .cv-brand-header {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .cv-brand-logo {
        width: 26px;
        height: 26px;
        object-fit: contain;
      }
      .cv-brand-title {
        font-size: 0.76rem;
        font-weight: 700;
        letter-spacing: 0.2em;
        color: #94a3b8;
        text-transform: uppercase;
      }

      .cv-theme-toggle {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: rgba(255, 255, 255, 0.06);
        color: #f8fafc;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        backdrop-filter: blur(8px);
        font-size: 0.9rem;
        z-index: 25;
        pointer-events: auto;
      }

      /* Contenido Central */
      .cv-hero-body {
        width: 100%;
        max-width: 350px;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        z-index: 20;
        margin: auto 0;
        padding: 0.5rem 0;
      }

      .cv-hero-ojo {
        width: 72px;
        height: 72px;
        object-fit: contain;
        margin-bottom: 0.75rem;
        filter: drop-shadow(0 4px 14px rgba(244, 63, 94, 0.4));
      }

      .cv-hero-title {
        font-size: 1.55rem;
        font-weight: 800;
        line-height: 1.25;
        margin: 0 0 0.4rem 0;
      }
      .cv-hero-title span {
        color: #f59e0b;
      }
      .cv-hero-desc {
        font-size: 0.82rem;
        color: #94a3b8;
        margin: 0 0 1.3rem 0;
        line-height: 1.4;
      }

      /* Botones de acción */
      .cv-action-group {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 12px;
        z-index: 30;
      }

      .cv-btn-hero {
        width: 100%;
        padding: 0.85rem 1.1rem;
        border-radius: 14px;
        border: none;
        color: #ffffff;
        display: flex;
        align-items: center;
        gap: 12px;
        cursor: pointer;
        pointer-events: auto;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
        transition: transform 0.15s ease, filter 0.15s ease;
      }
      .cv-btn-hero:hover {
        transform: translateY(-2px);
        filter: brightness(1.08);
      }
      .cv-btn-hero:active {
        transform: scale(0.98);
      }

      .cv-btn-hero--vr {
        background: linear-gradient(135deg, #be185d 0%, #e11d48 100%);
      }
      .cv-btn-hero--touch {
        background: linear-gradient(135deg, #059669 0%, #0d9488 100%);
      }

      .cv-btn-icon-box {
        width: 32px;
        height: 32px;
        border-radius: 9px;
        background: rgba(255, 255, 255, 0.22);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.1rem;
        flex-shrink: 0;
        pointer-events: none;
      }
      .cv-btn-text-content {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        text-align: left;
        pointer-events: none;
      }
      .cv-btn-main-label {
        font-weight: 700;
        font-size: 0.88rem;
        letter-spacing: 0.02em;
      }
      .cv-btn-sub {
        font-size: 0.68rem;
        font-weight: 400;
        opacity: 0.88;
        margin-top: 1px;
      }

      /* Barra inferior */
      .cv-bottom-info {
        width: 100%;
        max-width: 350px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 14px;
        padding: 0.65rem 0.4rem;
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        text-align: center;
        backdrop-filter: blur(10px);
        z-index: 20;
      }
      .cv-info-cell {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }
      .cv-info-cell:not(:last-child) {
        border-right: 1px solid rgba(255, 255, 255, 0.08);
      }
      .cv-info-val {
        font-size: 0.85rem;
        font-weight: 700;
        color: #f8fafc;
      }
      .cv-info-lbl {
        font-size: 0.62rem;
        color: #94a3b8;
        margin-top: 2px;
      }

      .cv-footer-text-group {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3px;
        margin-top: 0.65rem;
        text-align: center;
        z-index: 20;
      }
      .cv-footer-caption {
        font-size: 0.64rem;
        color: #94a3b8;
        opacity: 0.9;
      }
      .cv-footer-subcaption {
        font-size: 0.58rem;
        color: #64748b;
        letter-spacing: 0.05em;
      }
    `;
    screen.appendChild(style);

    // Grecas
    const grecaTop = document.createElement("div");
    grecaTop.className = "cv-greca-bar top";
    const grecaBottom = document.createElement("div");
    grecaBottom.className = "cv-greca-bar bottom";

    // Venados decorativos
    const venadoLeft = document.createElement("img");
    venadoLeft.className = "cv-bg-venado left";
    venadoLeft.src = "/assets/venado_izq-removebg-preview.png";
    venadoLeft.alt = "Venado";

    const venadoRight = document.createElement("img");
    venadoRight.className = "cv-bg-venado right";
    venadoRight.src = "/assets/venado-removebg-preview.png";
    venadoRight.alt = "Venado";

    // Barra superior
    const topNav = document.createElement("div");
    topNav.className = "cv-top-nav";
    topNav.innerHTML = `
      <div class="cv-brand-header">
        <img class="cv-brand-logo" src="/assets/cabezavenado-removebg-preview.png" alt="Logo" />
        <span class="cv-brand-title">CULTURAS VIVAS</span>
      </div>
    `;

    const themeToggle = document.createElement("button");
    themeToggle.type = "button";
    themeToggle.className = "cv-theme-toggle";
    themeToggle.innerHTML = "🌙";
    themeToggle.title = "Cambiar Tema";
    themeToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      this.isDarkMode = !this.isDarkMode;
      this.toggleTheme(screen, themeToggle);
    });
    topNav.appendChild(themeToggle);

    // Contenido Central
    const heroBody = document.createElement("div");
    heroBody.className = "cv-hero-body";
    heroBody.innerHTML = `
      <img class="cv-hero-ojo" src="/assets/ojo-removebg-preview.png" alt="Tsikuri" />
      <h1 class="cv-hero-title">¡Bienvenido a<br><span>Nayarit Inmersivo!</span></h1>
      <p class="cv-hero-desc">Elige cómo deseas recorrer nuestras salas culturales:</p>
    `;

    // Grupo de Botones
    const actionGroup = document.createElement("div");
    actionGroup.className = "cv-action-group";

    // Botón VR
    const btnVR = document.createElement("button");
    btnVR.type = "button";
    btnVR.className = "cv-btn-hero cv-btn-hero--vr";
    btnVR.innerHTML = `
      <div class="cv-btn-icon-box">🥽</div>
      <div class="cv-btn-text-content">
        <span class="cv-btn-main-label">ENTRAR EN MODO VR</span>
        <span class="cv-btn-sub">Para visores y experiencia 360°</span>
      </div>
    `;
    btnVR.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dispatch(NavigationAction.SELECT_VR);
    });

    // Botón Táctil
    const btnTouch = document.createElement("button");
    btnTouch.type = "button";
    btnTouch.className = "cv-btn-hero cv-btn-hero--touch";
    btnTouch.innerHTML = `
      <div class="cv-btn-icon-box">📱</div>
      <div class="cv-btn-text-content">
        <span class="cv-btn-main-label">MODO TÁCTIL / CELULAR</span>
        <span class="cv-btn-sub">Para explorar con touch</span>
      </div>
    `;
    btnTouch.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dispatch(NavigationAction.SELECT_2D);
    });

    actionGroup.append(btnVR, btnTouch);
    heroBody.appendChild(actionGroup);

    // Barra inferior
    const bottomWrapper = document.createElement("div");
    bottomWrapper.style.width = "100%";
    bottomWrapper.style.display = "flex";
    bottomWrapper.style.flexDirection = "column";
    bottomWrapper.style.alignItems = "center";
    bottomWrapper.style.zIndex = "20";

    const bottomInfo = document.createElement("div");
    bottomInfo.className = "cv-bottom-info";
    bottomInfo.innerHTML = `
      <div class="cv-info-cell">
        <span class="cv-info-val">4</span>
        <span class="cv-info-lbl">Culturas</span>
      </div>
      <div class="cv-info-cell">
        <span class="cv-info-val">En tu equipo</span>
        <span class="cv-info-lbl">Sin descargas</span>
      </div>
      <div class="cv-info-cell">
        <span class="cv-info-val">100%</span>
        <span class="cv-info-lbl">Interactivo</span>
      </div>
    `;

    const footerTextGroup = document.createElement("div");
    footerTextGroup.className = "cv-footer-text-group";
    footerTextGroup.innerHTML = `
      <span class="cv-footer-caption">Acceso cultural libre y abierto • Nayarit Inmersivo</span>
      <span class="cv-footer-subcaption">Patrimonio Vivo Wixárika, Náayeri, O'dam & Mexicanero</span>
    `;

    bottomWrapper.append(bottomInfo, footerTextGroup);

    screen.append(grecaTop, grecaBottom, venadoLeft, venadoRight, topNav, heroBody, bottomWrapper);
    parent.appendChild(screen);
    this.container = screen;
  }

  private toggleTheme(screen: HTMLElement, btn: HTMLElement): void {
    if (this.isDarkMode) {
      screen.style.backgroundColor = "#fbf9f4";
      screen.style.color = "#1e293b";
      btn.innerHTML = "☀️";
      btn.style.color = "#1e293b";
      btn.style.borderColor = "rgba(0,0,0,0.15)";
      btn.style.background = "rgba(0,0,0,0.06)";
    } else {
      screen.style.backgroundColor = "#0b0f17";
      screen.style.color = "#f8fafc";
      btn.innerHTML = "🌙";
      btn.style.color = "#f8fafc";
      btn.style.borderColor = "rgba(255,255,255,0.15)";
      btn.style.background = "rgba(255,255,255,0.06)";
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