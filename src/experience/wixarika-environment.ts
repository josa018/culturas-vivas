/** Contemporary exhibition design, not a reconstruction of a ceremonial space. */
export function createWixarikaEnvironment(): HTMLElement {
  const environment = document.createElement("a-entity");
  environment.id = "cv-wixarika-environment";
  const add = (tag: string, attributes: Record<string, string>, parent: HTMLElement = environment) => {
    const entity = document.createElement(tag);
    if (tag === "a-text") entity.setAttribute("font", "dejavu");
    for (const [key, value] of Object.entries(attributes)) entity.setAttribute(key, value);
    parent.appendChild(entity);
    return entity;
  };
  add("a-cylinder", {
    radius: "4.6", height: "4.2", position: "0 2.05 0", "open-ended": "true",
    "segments-radial": "48", material: "shader: flat; color: #674b3e; side: back",
  });
  add("a-circle", {
    radius: "4.62", rotation: "-90 0 0", position: "0 -0.04 0",
    "segments": "64", material: "shader: flat; color: #c1a078",
  });
  add("a-circle", {
    radius: "4.62", rotation: "90 0 0", position: "0 4.14 0",
    material: "shader: flat; color: #142c38",
  });
  for (const [radius, color] of [[4.3, "#dd7041"], [4.15, "#efc968"], [2.25, "#157d84"]] as const) {
    add("a-ring", {
      "radius-inner": String(radius - 0.07), "radius-outer": String(radius),
      rotation: "-90 0 0", position: "0 -0.025 0", material: `shader: flat; color: ${color}`,
    });
  }
  // Reuse the project's beaded textile border around the whole gallery.
  for (let index = 0; index < 12; index++) {
    const angle = index * Math.PI / 6;
    const x = Math.sin(angle) * 4.42;
    const z = -Math.cos(angle) * 4.42;
    const rotation = `0 ${-index * 30} 0`;
    for (const height of [0.38, 3.55]) {
      add("a-plane", {
        width: "2.4", height: "0.65", position: `${x} ${height} ${z}`, rotation,
        src: "/assets/branding/faja_wixarika_pattern.svg", material: "shader: flat; side: double",
      });
    }
    if (index % 2 === 1) {
      const ornament = add("a-entity", { position: `${x * 0.98} 2.1 ${z * 0.98}`, rotation });
      const colors = ["#edbf56", "#b72e43", "#162f43", "#18a6a1", "#e8783c", "#f4d67b"];
      colors.forEach((color, layer) => {
        const size = 0.75 - layer * 0.11;
        add("a-plane", {
          width: String(size), height: String(size), rotation: "0 0 45",
          position: `0 0 ${layer * 0.006}`, material: `shader: flat; color: ${color}; side: double`,
        }, ornament);
      });
    }
  }
  // A suspended woven-color canopy and matching floor mosaic frame the visit.
  for (const [height, rotation] of [[3.92, "90 0 45"], [-0.018, "-90 0 45"]] as const) {
    ["#183b4c", "#c94946", "#f1bd55", "#117e85", "#192f47"].forEach((color, index) => {
      const size = 1.9 - index * 0.32;
      add("a-plane", {
        width: String(size), height: String(size), rotation,
        position: `0 ${height + (height < 0 ? index : -index) * 0.002} 0`,
        material: `shader: flat; color: ${color}; side: double`,
      });
    });
  }
  add("a-text", {
    value: "WIXARIKA", align: "center", width: "5", color: "#ffe1a0",
    position: "0 3 -4.38", "letter-spacing": "4",
  });
  return environment;
}
