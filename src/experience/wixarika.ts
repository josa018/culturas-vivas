import type { ExhibitItemConfig } from "./constants";

export const WIXARIKA_CATEGORIES = [
  {
    id: "cultura",
    title: "Cultura",
    summary: "El pueblo wixárika conserva una vida espiritual ligada al venado, el maíz y el águila. El marakame guía las ceremonias y la sanación.",
    detail: "También conocidos como huicholes, prefieren su nombre propio: wixaritari (wixárika en singular). Habitan, entre otros lugares, en La Yesca, Nayarit. Su tradición espiritual relaciona deidades de la naturaleza con elementos católicos y reconoce cinco lugares sagrados.",
    count: 3,
  },
  {
    id: "arte",
    title: "Arte",
    summary: "Los nierika y los ojos de Dios expresan la relación con las deidades y los lugares sagrados. El arte transmite memoria y espiritualidad.",
    detail: "Las piezas reunidas en esta categoría acompañan la información cultural proporcionada. Los símbolos de estas expresiones artesanales tienen un sentido espiritual, más allá de su valor decorativo.",
    count: 2,
  },
  {
    id: "vestimenta",
    title: "Vestimenta",
    summary: "La indumentaria se entiende como una oración. Sus bordados de animales y flores, junto con la joyería de chaquira, expresan identidad y espiritualidad.",
    detail: "El atuendo masculino incluye camisa y calzón de manta bordados, faja, morrales, pañolón, huaraches y sombrero de palma con plumas. El femenino combina blusa corta, falda bordada, pañuelo en la cabeza y huaraches. Ambos pueden llevar joyería de chaquira.",
    count: 3,
  },
  {
    id: "comida",
    title: "Alimentación",
    summary: "El maíz es sustento principal y tiene un lugar sagrado en la tradición wixárika. La información compartida no detalla platillos cotidianos.",
    detail: "El peyote aparece en los textos por su uso ceremonial y su vínculo con las caminatas rituales y la inspiración espiritual para los bordados. No se presenta aquí como alimento cotidiano ni como recomendación de consumo.",
    count: 4,
  },
  {
    id: "vivienda",
    title: "Vivienda",
    summary: "El Caliwey es un templo ceremonial de planta circular, construido con adobe crudo y techo de madera, palma o zacate. Allí se pide salud y buenas cosechas.",
    detail: "La información proporcionada describe este espacio ceremonial, no las casas de uso cotidiano. Las imágenes de esta categoría se conservan con la clasificación de los archivos recibidos.",
    count: 5,
  },
] as const;

export const WIXARIKA_EXHIBITS: readonly ExhibitItemConfig[] =
  WIXARIKA_CATEGORIES.map((category, index) => {
    const angle = (index - 2) * Math.PI / 3;
    const mediaUrls = Array.from({ length: category.count }, (_, photo) =>
      `/assets/wixarika/${category.id}/${photo + 1}.webp`,
    );
    return {
      id: `exhibit-wixarika-${category.id}`,
      title: category.title,
      description: category.summary,
      mediaType: "IMAGE_2D",
      mediaUrl: mediaUrls[0],
      mediaUrls,
      galleryPosition: { x: Math.sin(angle) * 3, y: 1.6, z: -Math.cos(angle) * 3 },
      galleryRotation: { x: 0, y: -angle * 180 / Math.PI, z: 0 },
      autoRotate: false,
      rotationSpeed: 0,
    };
  });
