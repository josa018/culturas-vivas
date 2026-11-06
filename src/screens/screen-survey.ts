import { ScreenId, NavigationAction } from "../navigation/index";
import type { ScreenView, NavigationDispatcher } from "./base-screen";

export class SurveyScreenView implements ScreenView {
  public readonly id = ScreenId.SURVEY;
  private container: HTMLElement | null = null;
  private readonly dispatch: NavigationDispatcher;
  private currentRating: number = 5;

  constructor(dispatch: NavigationDispatcher) {
    this.dispatch = dispatch;
  }

  public mount(parent: HTMLElement): void {
    if (this.container) return;

    const screen = document.createElement("section");
    screen.id = "cv-survey-screen";
    screen.setAttribute("data-screen-id", this.id);

    const style = document.createElement("style");
    style.textContent = `
      #cv-survey-screen {
        position: fixed !important;
        inset: 0 !important;
        z-index: 2147483647 !important;
        display: none;
        flex-direction: column;
        justify-content: space-between;
        align-items: center;
        padding: 30px 16px 24px;
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background-color: #0b0f17;
        color: #f8fafc;
        overflow-y: auto;
        overflow-x: hidden;
        pointer-events: auto !important;
      }

      .cv-survey-greca {
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
      .cv-survey-greca.top { top: 0; }
      .cv-survey-greca.bottom { bottom: 0; }

      .cv-survey-card {
        width: 100%;
        max-width: 380px;
        background: rgba(22, 27, 34, 0.96);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 24px;
        padding: 24px 20px 20px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.75);
        z-index: 20;
        margin: auto 0;
      }

      .cv-survey-brand {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
      }
      .cv-survey-logo {
        width: 24px;
        height: 24px;
        object-fit: contain;
      }
      .cv-survey-brand-text {
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.2em;
        color: #94a3b8;
        text-transform: uppercase;
      }

      .cv-survey-title {
        font-size: 1.4rem;
        font-weight: 800;
        margin: 2px 0 6px;
        color: #f8fafc;
      }

      .cv-survey-subtitle {
        font-size: 0.82rem;
        color: #94a3b8;
        margin: 0 0 16px;
      }

      .cv-survey-stars-box {
        display: flex;
        gap: 10px;
        margin-bottom: 18px;
      }

      .cv-survey-star {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        width: 46px;
        height: 46px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.5rem;
        color: rgba(255, 255, 255, 0.2);
        cursor: pointer;
        transition: transform 0.15s ease, background 0.15s ease, color 0.15s ease;
      }
      .cv-survey-star:hover {
        transform: scale(1.1);
        color: #fbbf24;
      }
      .cv-survey-star.active {
        color: #fbbf24;
        background: rgba(245, 158, 11, 0.12);
        border-color: rgba(245, 158, 11, 0.4);
      }

      .cv-survey-textarea-wrap {
        width: 100%;
        text-align: left;
        margin-bottom: 16px;
      }
      .cv-survey-textarea-lbl {
        font-size: 0.78rem;
        color: #94a3b8;
        margin-bottom: 6px;
        display: block;
      }
      .cv-survey-textarea {
        width: 100%;
        height: 75px;
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(15, 23, 42, 0.6);
        color: #f8fafc;
        padding: 10px 12px;
        box-sizing: border-box;
        font-size: 0.85rem;
        resize: none;
        outline: none;
        font-family: inherit;
      }
      .cv-survey-textarea:focus {
        border-color: rgba(244, 63, 94, 0.6);
      }

      .cv-btn-submit-survey {
        width: 100%;
        padding: 0.85rem 1.2rem;
        border-radius: 14px;
        border: none;
        background: linear-gradient(135deg, #be185d 0%, #e11d48 100%);
        color: #ffffff;
        font-size: 0.92rem;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 4px 14px rgba(190, 24, 93, 0.45);
        transition: transform 0.15s ease, filter 0.15s ease;
      }
      .cv-btn-submit-survey:hover {
        transform: translateY(-2px);
        filter: brightness(1.1);
      }

      .cv-btn-skip-survey {
        width: 100%;
        padding: 0.75rem 1.2rem;
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: transparent;
        color: #94a3b8;
        font-size: 0.85rem;
        cursor: pointer;
        margin-top: 8px;
        transition: background 0.15s ease, color 0.15s ease;
      }
      .cv-btn-skip-survey:hover {
        background: rgba(255, 255, 255, 0.05);
        color: #f8fafc;
      }
    `;
    screen.appendChild(style);

    const grecaTop = document.createElement("div");
    grecaTop.className = "cv-survey-greca top";
    const grecaBottom = document.createElement("div");
    grecaBottom.className = "cv-survey-greca bottom";

    const card = document.createElement("div");
    card.className = "cv-survey-card";

    const brand = document.createElement("div");
    brand.className = "cv-survey-brand";
    brand.innerHTML = `
      <img class="cv-survey-logo" src="/assets/cabezavenado-removebg-preview.png" alt="Logo" />
      <span class="cv-survey-brand-text">CULTURAS VIVAS</span>
    `;

    const title = document.createElement("h2");
    title.className = "cv-survey-title";
    title.textContent = "Encuesta de Satisfacción";

    const subtitle = document.createElement("p");
    subtitle.className = "cv-survey-subtitle";
    subtitle.textContent = "¿Cómo calificarías tu experiencia cultural?";

    const starsBox = document.createElement("div");
    starsBox.className = "cv-survey-stars-box";

    for (let star = 1; star <= 5; star++) {
      const starBtn = document.createElement("button");
      starBtn.type = "button";
      starBtn.className = "cv-survey-star active";
      starBtn.innerHTML = "★";
      starBtn.setAttribute("data-star", star.toString());

      starBtn.addEventListener("click", () => {
        this.currentRating = star;
        this.updateStarsUI(starsBox, star);
      });

      starsBox.appendChild(starBtn);
    }

    const commentWrap = document.createElement("div");
    commentWrap.className = "cv-survey-textarea-wrap";
    commentWrap.innerHTML = `
      <label class="cv-survey-textarea-lbl">Comentarios o sugerencias (opcional):</label>
      <textarea class="cv-survey-textarea" placeholder="Escribe tu opinión aquí..."></textarea>
    `;

    const submitBtn = document.createElement("button");
    submitBtn.type = "button";
    submitBtn.className = "cv-btn-submit-survey";
    submitBtn.textContent = "Enviar Encuesta";
    submitBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const textarea = this.container?.querySelector<HTMLTextAreaElement>(".cv-survey-textarea");
      const feedback = textarea?.value?.trim() || "";

      this.hide();
      this.dispatch(NavigationAction.COMPLETE_SURVEY, {
        surveyAnswers: {
          rating: this.currentRating,
          feedback,
        },
      });
    });

    const skipBtn = document.createElement("button");
    skipBtn.type = "button";
    skipBtn.className = "cv-btn-skip-survey";
    skipBtn.textContent = "Omitir";
    skipBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.hide();
      this.dispatch(NavigationAction.SKIP_SURVEY);
    });

    card.append(brand, title, subtitle, starsBox, commentWrap, submitBtn, skipBtn);
    screen.append(grecaTop, grecaBottom, card);

    parent.appendChild(screen);
    this.container = screen;
  }

  private updateStarsUI(box: HTMLElement, rating: number): void {
    const stars = box.querySelectorAll<HTMLButtonElement>(".cv-survey-star");
    stars.forEach((btn, index) => {
      if (index < rating) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }

  public unmount(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }

  public show(): void {
    if (this.container) {
      this.container.style.display = "flex";
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