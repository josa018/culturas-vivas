/** In-world controls work with the same click/fuse interaction as exhibits. */
export function appendImageGallery(
  root: HTMLElement,
  plane: HTMLElement,
  title: string,
  urls: readonly string[],
): void {
  let index = 0;
  const caption = document.createElement("a-text");
  caption.setAttribute("font", "dejavu");
  caption.setAttribute("align", "center");
  caption.setAttribute("width", "2.6");
  caption.setAttribute("position", "0 0.64 0.02");
  const update = () => {
    plane.setAttribute("src", urls[index]!);
    caption.setAttribute("value", `${title} (${index + 1}/${urls.length})`);
    root.setAttribute("data-photo-index", String(index));
  };
  root.appendChild(caption);
  for (const direction of [-1, 1]) {
    const button = document.createElement("a-plane");
    button.setAttribute("class", "clickable cv-gallery-button");
    button.setAttribute("data-action", direction < 0 ? "previous-photo" : "next-photo");
    button.setAttribute("position", `${direction * 0.46} -0.69 0.05`);
    button.setAttribute("width", "0.76");
    button.setAttribute("height", "0.28");
    button.setAttribute("material", "shader: flat; color: #123e48; side: double");
    const label = document.createElement("a-text");
    label.setAttribute("font", "dejavu");
    label.setAttribute("value", direction < 0 ? "< Anterior" : "Siguiente >");
    label.setAttribute("align", "center");
    label.setAttribute("width", "1.8");
    label.setAttribute("position", "0 0 0.01");
    button.appendChild(label);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      index = (index + direction + urls.length) % urls.length;
      update();
    });
    root.appendChild(button);
  }
  update();
}
