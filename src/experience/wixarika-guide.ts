import { WIXARIKA_CATEGORIES } from "./wixarika";

export function createWixarikaGuide(): HTMLDetailsElement {
  const guide = document.createElement("details");
  guide.className = "cv-wixarika-guide";
  const heading = document.createElement("summary");
  heading.textContent = "Explorar categorías · Wixárika";
  guide.appendChild(heading);
  const categories = document.createElement("div");
  categories.className = "cv-wixarika-categories";
  categories.setAttribute("role", "group");
  categories.setAttribute("aria-label", "Categorías de la sala wixárika");
  const content = document.createElement("section");
  content.setAttribute("aria-live", "polite");
  const buttons: HTMLButtonElement[] = [];
  const selectCategory = (index: number) => {
    const category = WIXARIKA_CATEGORIES[index]!;
    buttons.forEach((button, i) => button.setAttribute("aria-pressed", String(i === index)));
    content.replaceChildren();
    const title = document.createElement("h2");
    title.textContent = category.title;
    const image = document.createElement("img");
    image.width = 1600;
    image.height = 1000;
    const controls = document.createElement("div");
    controls.className = "cv-wixarika-photo-controls";
    const count = document.createElement("span");
    let photo = 0;
    const updatePhoto = () => {
      image.src = `/assets/wixarika/${category.id}/${photo + 1}.webp`;
      image.alt = `${category.title} wixárika: imagen ${photo + 1} de ${category.count}`;
      count.textContent = `${photo + 1} / ${category.count}`;
    };
    const previous = document.createElement("button");
    previous.type = "button";
    previous.textContent = "← Anterior";
    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "Siguiente →";
    previous.addEventListener("click", () => {
      photo = (photo - 1 + category.count) % category.count;
      updatePhoto();
    });
    next.addEventListener("click", () => {
      photo = (photo + 1) % category.count;
      updatePhoto();
    });
    controls.append(previous, count, next);
    const summary = document.createElement("p");
    summary.textContent = category.summary;
    const more = document.createElement("details");
    const moreHeading = document.createElement("summary");
    moreHeading.textContent = "Saber más";
    const detail = document.createElement("p");
    detail.textContent = category.detail;
    more.append(moreHeading, detail);
    content.append(title, image, controls, summary, more);
    updatePhoto();
  };
  WIXARIKA_CATEGORIES.forEach((category, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = category.title;
    button.addEventListener("click", () => selectCategory(index));
    buttons.push(button);
    categories.appendChild(button);
  });
  guide.append(categories, content);
  selectCategory(0);
  return guide;
}
