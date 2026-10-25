import { ScreenId, NavigationAction } from "../navigation/index";
import type { ScreenView, NavigationDispatcher } from "./base-screen";
import { UI_CLASSES, UI_TEXT } from "./constants";

const DEFAULT_RATING = 5;

export class SurveyScreenView implements ScreenView {
  public readonly id = ScreenId.SURVEY;
  private container: HTMLElement | null = null;
  private readonly dispatch: NavigationDispatcher;
  private selectedRating: number = DEFAULT_RATING;

  constructor(dispatch: NavigationDispatcher) {
    this.dispatch = dispatch;
  }

  public mount(parent: HTMLElement): void {
    if (this.container) {
      return;
    }

    const element = document.createElement("section");
    element.className = `${UI_CLASSES.SCREEN_CONTAINER} cv-screen--survey`;
    element.setAttribute("data-screen-id", this.id);

    const card = document.createElement("div");
    card.className = "cv-survey-card";

    const title = document.createElement("h2");
    title.className = "cv-title";
    title.textContent = UI_TEXT.SURVEY_TITLE;

    const ratingQuestion = document.createElement("div");
    ratingQuestion.className = "cv-survey-question";

    const ratingLabel = document.createElement("label");
    ratingLabel.className = "cv-label";
    ratingLabel.textContent = UI_TEXT.SURVEY_QUESTION_RATING;

    const ratingGroup = document.createElement("div");
    ratingGroup.className = UI_CLASSES.RATING_GROUP;
    ratingGroup.setAttribute("role", "radiogroup");
    ratingGroup.setAttribute("aria-label", UI_TEXT.SURVEY_QUESTION_RATING);

    const starButtons: HTMLButtonElement[] = [];
    for (let star = 1; star <= 5; star++) {
      const starBtn = document.createElement("button");
      starBtn.type = "button";
      starBtn.className = `${UI_CLASSES.RATING_BUTTON} ${
        star <= DEFAULT_RATING ? UI_CLASSES.RATING_ACTIVE : ""
      }`;
      starBtn.setAttribute("data-rating", star.toString());
      starBtn.setAttribute("aria-label", `${star} de 5 estrellas`);
      starBtn.textContent = "★";

      starBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        this.selectedRating = star;
        starButtons.forEach((btn, index) => {
          if (index + 1 <= this.selectedRating) {
            btn.classList.add(UI_CLASSES.RATING_ACTIVE);
          } else {
            btn.classList.remove(UI_CLASSES.RATING_ACTIVE);
          }
        });
      });

      starButtons.push(starBtn);
      ratingGroup.appendChild(starBtn);
    }

    ratingQuestion.append(ratingLabel, ratingGroup);

    const feedbackQuestion = document.createElement("div");
    feedbackQuestion.className = "cv-survey-question";

    const feedbackLabel = document.createElement("label");
    feedbackLabel.className = "cv-label";
    feedbackLabel.setAttribute("for", "cv-feedback-input");
    feedbackLabel.textContent = UI_TEXT.SURVEY_QUESTION_FEEDBACK;

    const feedbackTextarea = document.createElement("textarea");
    feedbackTextarea.id = "cv-feedback-input";
    feedbackTextarea.className = "cv-textarea";
    feedbackTextarea.rows = 3;
    feedbackTextarea.placeholder = UI_TEXT.SURVEY_FEEDBACK_PLACEHOLDER;

    feedbackQuestion.append(feedbackLabel, feedbackTextarea);

    const buttonStack = document.createElement("div");
    buttonStack.className = "cv-button-stack";

    const submitBtn = document.createElement("button");
    submitBtn.type = "button";
    submitBtn.className = UI_CLASSES.BUTTON_PRIMARY;
    submitBtn.setAttribute("data-action", "submit-survey");

    const submitLabel = document.createElement("span");
    submitLabel.textContent = UI_TEXT.SURVEY_BTN_SUBMIT;
    submitBtn.appendChild(submitLabel);

    submitBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      this.dispatch(NavigationAction.COMPLETE_SURVEY, {
        surveyAnswers: {
          rating: this.selectedRating,
          feedback: feedbackTextarea.value.trim() || undefined,
        },
      });
    });

    const skipBtn = document.createElement("button");
    skipBtn.type = "button";
    skipBtn.className = UI_CLASSES.BUTTON_OUTLINE;
    skipBtn.setAttribute("data-action", "skip-survey");

    const skipLabel = document.createElement("span");
    skipLabel.textContent = UI_TEXT.SURVEY_BTN_SKIP;
    skipBtn.appendChild(skipLabel);

    skipBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      this.dispatch(NavigationAction.SKIP_SURVEY);
    });

    buttonStack.append(submitBtn, skipBtn);
    card.append(title, ratingQuestion, feedbackQuestion, buttonStack);
    element.appendChild(card);

    parent.appendChild(element);
    this.container = element;
  }

  public unmount(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }

  public show(): void {
    if (this.container) {
      this.container.classList.add(UI_CLASSES.SCREEN_ACTIVE);
      this.container.classList.remove(UI_CLASSES.SCREEN_HIDDEN);
    }
  }

  public hide(): void {
    if (this.container) {
      this.container.classList.remove(UI_CLASSES.SCREEN_ACTIVE);
      this.container.classList.add(UI_CLASSES.SCREEN_HIDDEN);
    }
  }

  public getElement(): HTMLElement | null {
    return this.container;
  }
}
