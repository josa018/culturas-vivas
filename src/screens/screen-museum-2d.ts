import { ScreenId, NavigationAction } from "../navigation/index";
import type { ScreenView, NavigationDispatcher } from "./base-screen";

export type CultureKey = "wixarika" | "naayeri" | "odam" | "mexicanero";

interface MuseumTopicItem {
  id: string;
  name: string;
  image: string;
  shortDesc: string;
  whyText: string;
}

interface MuseumTopic {
  title: string;
  headline: string;
  items: MuseumTopicItem[];
}

const MUSEUM_DATA: Record<CultureKey, Record<string, MuseumTopic>> = {
  wixarika: {
    vestimenta: {
      title: "Indumentaria Sagrada Tradicional",
      headline: "Textiles en manta blanca, lana y chaquira artesanal",
      items: [
        {
          id: "kutuni",
          name: "Kutuni y Tuwitua (Camisa y Calzón de Manta)",
          image: "/assets/vestimenta-wixarika.png",
          shortDesc: "Prenda de algodón blanca bordada con venados, peyote y águilas bicéfalas.",
          whyText: "¿Por qué visten así? Los bordados en punto de cruz son rezos y visiones protectoras que conectan a la persona con sus deidades naturales.",
        },
        {
          id: "accesorios",
          name: "Xikuri, Kuka y Rupurero (Morrales y Sombrero)",
          image: "/assets/accesorios-wixarika.png",
          shortDesc: "Morrales bordados cruzados, pectorales de chaquira y sombrero de soyate.",
          whyText: "¿Por qué los portan? Indican el rango espiritual y compromiso en la comunidad, sirviendo de resguardo para objetos sagrados durante peregrinaciones.",
        },
      ],
    },
    comidas: {
      title: "Alimentación Ancestral de la Sierra",
      headline: "Maíz sagrado, recolección y cacería ritual",
      items: [
        {
          id: "maiz",
          name: "Maíz de Cinco Colores y Gorditas de Horno",
          image: "/assets/comida-maiz.png",
          shortDesc: "Base diaria cocinada en comal de barro con quelites y atole blanco.",
          whyText: "¿Por qué comen así? Consideran al maíz hermano del ser humano; nutre el alma comunitaria y se respeta en cada siembra y cosecha.",
        },
        {
          id: "venado",
          name: "Carne Ritual y Caldos Ceremoniales",
          image: "/assets/comida-ritual.png",
          shortDesc: "Alimentos preparados exclusivamente para asambleas y fiestas del mitote.",
          whyText: "¿Por qué se consume? Es la comunión con el Hermano Mayor Kauyumari (el venado azul) para agradecer la abundancia y la lluvia.",
        },
      ],
    },
    tradiciones: {
      title: "Ceremonias y Cosmovisión Sagrada",
      headline: "Rutas sagradas, cantos del Marakame y equilibrio universal",
      items: [
        {
          id: "peregrinacion",
          name: "Peregrinación Sagrada a Wirikuta",
          image: "/assets/tradicion-wirikuta.png",
          shortDesc: "Recorrido ceremonial a pie por el desierto guiado por cantos y rezos.",
          whyText: "¿Por qué lo hacen? Para renovar la energía del mundo, pedir lluvia para los campos y mantener vivos los pactos con sus antepasados.",
        },
      ],
    },
    artesanias: {
      title: "Arte Sagrado en Chaquira y Estambre",
      headline: "Plasmación visual de las visiones del Marakame",
      items: [
        {
          id: "nierika",
          name: "Tablas de Estambre (Nierika)",
          image: "/assets/artesania-nierika.png",
          shortDesc: "Tableros de madera cubiertos con cera de abeja donde se tejen figuras con estambre.",
          whyText: "¿Por qué las elaboran? Funcionan como portales cósmicos que plasman los mensajes revelados en los cantos sagrados.",
        },
      ],
    },
    lenguaje: {
      title: "Wixárika Niukiyari (Palabra Viva)",
      headline: "Lengua viva de la familia lingüística yuto-azteca",
      items: [
        {
          id: "palabras",
          name: "Expresiones y Cantos en Lengua Madre",
          image: "/assets/lenguaje-wixarika.png",
          shortDesc: "Vocabulario de respeto: 'Pamparios' (Gracias), 'Kauyumari' (Venado Sagrado).",
          whyText: "¿Por qué conservan su lengua? En su vocabulario residen los nombres verdaderos de los elementos naturales y las memorias de su linaje.",
        },
      ],
    },
  },
  naayeri: {
    vestimenta: {
      title: "Indumentaria Cora (Náayeri)",
      headline: "Manta tradicional teñida con tintes de corteza y fajas de telar",
      items: [
        {
          id: "traje-cora",
          name: "Cotón y Calzón con Faja de Lana",
          image: "/assets/vestimenta-naayeri.png",
          shortDesc: "Camisa holgada y ceñidor multicolor tejido en telar de cintura.",
          whyText: "¿Por qué visten así? El ceñidor protege el centro energético del cuerpo y los colores identifican el linaje comunitario de la sierra.",
        },
      ],
    },
    comidas: {
      title: "Gastronomía del Nayar",
      headline: "Pescados de río, atole de pinole y pitayas",
      items: [
        {
          id: "gastronomia-cora",
          name: "Comida de Río y Milpa",
          image: "/assets/comida-cora.png",
          shortDesc: "Chacales (camarón de río), caldos serranos y tamales de ceniza.",
          whyText: "¿Por qué comen así? Aprovechan el cauce de la cuenca del río San Pedro y la fertilidad de las cañadas serranas.",
        },
      ],
    },
    tradiciones: {
      title: "La Judea Cora",
      headline: "Patrimonio cultural de Semana Santa en El Nayar",
      items: [
        {
          id: "judea",
          name: "Los Borrados de la Judea",
          image: "/assets/judea-cora.png",
          shortDesc: "Guerreros que pintan sus cuerpos con barro negro y blanco en un combate cósmico.",
          whyText: "¿Por qué lo realizan? Simboliza la batalla constante entre las fuerzas del día y de la noche para regenerar el cosmos.",
        },
      ],
    },
    artesanias: {
      title: "Morrales y Cerámica del Nayar",
      headline: "Textiles en telar de cintura y alfarería tradicional",
      items: [
        {
          id: "morrales-cora",
          name: "Morrales de Lana Náayeri",
          image: "/assets/artesania-cora.png",
          shortDesc: "Bolsos con grecas geométricas de estrellas y flores de sierra.",
          whyText: "¿Por qué los tejen? El patrón de la estrella matutina honra a Sautari, guía espiritual en las madrugadas serranas.",
        },
      ],
    },
    lenguaje: {
      title: "Lengua Náayeri",
      headline: "Voz milenaria hablada en la mesa del Nayar",
      items: [
        {
          id: "lengua-cora",
          name: "Voces y Cantos Rituales",
          image: "/assets/lengua-cora.png",
          shortDesc: "Saludos comunitarios y rezos transmitidos oralmente entre generaciones.",
          whyText: "¿Por qué es importante? Guarda la historia guerrera y los relatos fundacionales que nunca fueron escritos en papel.",
        },
      ],
    },
  },
  odam: {
    vestimenta: {
      title: "Indumentaria Tepehuana (O'dam)",
      headline: "Colores vivos, telares de lana y bordados de grecas",
      items: [
        {
          id: "traje-odam",
          name: "Vestimenta O'dam de Huajicori",
          image: "/assets/vestimenta-odam.png",
          shortDesc: "Blusas y faldas amplias con listones satinados y morrales de lana cruda.",
          whyText: "¿Por qué visten así? Las telas satinadas y listones representan la alegría de la fiesta agrícola y el respeto al frío de las serranías.",
        },
      ],
    },
    comidas: {
      title: "Gastronomía O'dam",
      headline: "Gorditas de maíz quebrado y frijol serrano",
      items: [
        {
          id: "comida-odam",
          name: "Sustento de la Serranía",
          image: "/assets/comida-odam.png",
          shortDesc: "Atole agrio, nopales silvestres y tamales de frijol.",
          whyText: "¿Por qué comen así? Alimentos altamente energéticos diseñados para resistir las jornadas de siembra en laderas inclinadas.",
        },
      ],
    },
    tradiciones: {
      title: "La Fiesta del Mitote",
      headline: "Danza circular en el patio sagrado (Xi'iwoy)",
      items: [
        {
          id: "mitote",
          name: "El Mitote Sagrado",
          image: "/assets/tradicion-odam.png",
          shortDesc: "Ceremonia nocturna alrededor del fuego con música de arco musical.",
          whyText: "¿Por qué lo celebran? Para agradecer las cosechas, pedir lluvia a los cuatro vientos y mantener en paz a la comunidad.",
        },
      ],
    },
    artesanias: {
      title: "Telar y Madera O'dam",
      headline: "Cestería de sotol y fajas de lana",
      items: [
        {
          id: "artesania-odam",
          name: "Fajas y Cestería Tradicional",
          image: "/assets/artesania-odam.png",
          shortDesc: "Piezas utilitarias y ceremoniales tejidas con fibras de la región.",
          whyText: "¿Por qué las elaboran? Emplean materiales recolectados en el monte que duran décadas resistiendo la intemperie.",
        },
      ],
    },
    lenguaje: {
      title: "Lengua O'dam",
      headline: "Variante tepehuano del sur viva en Nayarit",
      items: [
        {
          id: "lengua-odam",
          name: "La Palabra O'dam",
          image: "/assets/lengua-odam.png",
          shortDesc: "Frases de convivencia campesina y cantos ceremoniales del arco musical.",
          whyText: "¿Por qué persiste? Porque el mitote no puede celebrarse en otro idioma; las deidades solo responden en lengua materna.",
        },
      ],
    },
  },
  mexicanero: {
    vestimenta: {
      title: "Indumentaria Mexicanera",
      headline: "Ropa de algodón serrano y elementos tradicionales náhuatl",
      items: [
        {
          id: "traje-mexicanero",
          name: "Traje Tradicional Mexicanero",
          image: "/assets/vestimenta-mexicanero.png",
          shortDesc: "Prendas cómodas de manta con sombrero de palma y pañuelo al cuello.",
          whyText: "¿Por qué visten así? Adaptada a la vida silvícola y agrícola de las cañadas más remotas de la sierra nayarita.",
        },
      ],
    },
    comidas: {
      title: "Gastronomía Serrana",
      headline: "Maíces criollos y flora silvestre",
      items: [
        {
          id: "comida-mexicanero",
          name: "Cocina Tradicional Serrana",
          image: "/assets/comida-mexicanero.png",
          shortDesc: "Quelites cocidos en barro, tortillas a mano y frutos de temporada.",
          whyText: "¿Por qué se alimentan así? Conocimiento botánico centenario que aprovecha hierbas medicinales y nutritivas de la sierra.",
        },
      ],
    },
    tradiciones: {
      title: "El Xuravet y Fiestas Patronales",
      headline: "Danza ritual y mitote mexicanero",
      items: [
        {
          id: "tradicion-mexicanero",
          name: "Mitote y Danza de Conquista",
          image: "/assets/tradicion-mexicanero.png",
          shortDesc: "Reuniones comunitarias que combinan danzas indígenas con devoción tradicional.",
          whyText: "¿Por qué se realiza? Reafirma la identidad única de los hablantes de náhuatl en el occidente mexicano.",
        },
      ],
    },
    artesanias: {
      title: "Artesanías y Botánica",
      headline: "Preparados herbales y utensilios de madera tallada",
      items: [
        {
          id: "artesania-mexicanero",
          name: "Talla en Madera y Fibras",
          image: "/assets/artesania-mexicanero.png",
          shortDesc: "Cucharas de madera, bateas y canastos resistentes.",
          whyText: "¿Por qué las fabrican? Para el uso diario en las casas de la serranía y el trueque solidario entre familias.",
        },
      ],
    },
    lenguaje: {
      title: "Náhuatl Mexicanero",
      headline: "Enclave lingüístico náhuatl en Nayarit",
      items: [
        {
          id: "lengua-mexicanero",
          name: "El Náhuatl del Noroccidente",
          image: "/assets/lengua-mexicanero.png",
          shortDesc: "Variante dialectal única conservada en la sierra de Nayarit y Durango.",
          whyText: "¿Por qué es tan valiosa? Es el testimonio vivo de las migraciones históricas en el occidente de México.",
        },
      ],
    },
  },
};

export class Museum2DScreenView implements ScreenView {
  public readonly id = ScreenId.MUSEUM_2D;
  private container: HTMLElement | null = null;
  private readonly dispatch: NavigationDispatcher;
  private currentCulture: CultureKey = "wixarika";
  private activeCategory: string = "vestimenta";

  constructor(dispatch: NavigationDispatcher) {
    this.dispatch = dispatch;
  }

  public setCulture(culture: CultureKey): void {
    this.currentCulture = culture;
    this.activeCategory = "vestimenta";
    if (this.container) {
      this.renderContent();
    }
  }

  public mount(parent: HTMLElement): void {
    if (this.container) return;

    const screen = document.createElement("section");
    screen.id = "cv-museum-2d-screen";
    screen.setAttribute("data-screen-id", this.id);

    const style = document.createElement("style");
    style.textContent = `
      #cv-museum-2d-screen {
        position: fixed !important;
        inset: 0 !important;
        z-index: 5000 !important;
        display: none;
        flex-direction: column;
        justify-content: space-between;
        background-color: #0c1017;
        color: #f8fafc;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        box-sizing: border-box;
        padding: 30px 24px 20px;
        overflow-y: auto;
        pointer-events: auto !important;
      }

      .cv-museum-greca {
        position: fixed;
        left: 0;
        right: 0;
        height: 22px;
        background-image: url("/assets/OJODEDIOSCHAQUIRABAJAOYARRIBA.PNG");
        background-repeat: repeat-x;
        background-size: auto 22px;
        z-index: 5010;
        pointer-events: none;
      }
      .cv-museum-greca.top { top: 0; }
      .cv-museum-greca.bottom { bottom: 0; }

      .cv-m2d-top-nav {
        width: 100%;
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
        z-index: 5020;
      }

      .cv-btn-change-culture {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.16);
        color: #f8fafc;
        border-radius: 999px;
        padding: 0.45rem 1rem;
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s ease;
      }
      .cv-btn-change-culture:hover {
        background: rgba(255, 255, 255, 0.18);
      }

      .cv-m2d-badge-region {
        border: 1px solid rgba(225, 29, 72, 0.5);
        color: #f43f5e;
        background: rgba(225, 29, 72, 0.1);
        padding: 4px 14px;
        border-radius: 999px;
        font-size: 0.72rem;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .cv-m2d-header-title {
        margin-bottom: 1.2rem;
        z-index: 5020;
      }
      .cv-m2d-header-title h2 {
        font-size: 2rem;
        font-weight: 800;
        margin: 0 0 4px;
        color: #e11d48;
      }
      .cv-m2d-header-title p {
        font-size: 0.9rem;
        color: #94a3b8;
        margin: 0;
      }

      /* Barra de Pestañas */
      .cv-m2d-tabs-bar {
        display: flex;
        gap: 12px;
        overflow-x: auto;
        padding-bottom: 8px;
        margin-bottom: 1.2rem;
        z-index: 5020;
      }
      .cv-m2d-tab-btn {
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: #94a3b8;
        border-radius: 12px;
        padding: 0.6rem 1.1rem;
        font-size: 0.86rem;
        font-weight: 600;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        white-space: nowrap;
        transition: all 0.2s ease;
      }
      .cv-m2d-tab-btn:hover {
        background: rgba(255, 255, 255, 0.12);
        color: #f8fafc;
      }
      .cv-m2d-tab-btn.active {
        background: #e11d48;
        color: #ffffff;
        border-color: #e11d48;
        box-shadow: 0 4px 14px rgba(225, 29, 72, 0.45);
      }

      /* Vitrina / Escaparate Visual */
      .cv-m2d-exhibit-card {
        background: #111827;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 20px;
        padding: 22px;
        box-sizing: border-box;
        margin-bottom: 1.5rem;
        z-index: 5020;
      }
      .cv-m2d-topic-title {
        font-size: 1.25rem;
        font-weight: 800;
        color: #f8fafc;
        margin: 0 0 4px;
      }
      .cv-m2d-topic-headline {
        font-size: 0.85rem;
        color: #94a3b8;
        margin: 0 0 16px;
      }

      .cv-m2d-items-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 16px;
      }
      .cv-m2d-item-box {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 16px;
        padding: 16px;
        cursor: pointer;
        transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
      }
      .cv-m2d-item-box:hover {
        transform: translateY(-3px);
        border-color: #e11d48;
        background: rgba(225, 29, 72, 0.05);
      }
      .cv-m2d-item-box h4 {
        margin: 0 0 6px;
        font-size: 1rem;
        font-weight: 700;
        color: #fda4af;
      }
      .cv-m2d-item-box p {
        margin: 0 0 10px;
        font-size: 0.83rem;
        line-height: 1.45;
        color: #cbd5e1;
      }
      .cv-m2d-why-badge {
        background: rgba(245, 158, 11, 0.1);
        border-left: 3px solid #f59e0b;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 0.8rem;
        line-height: 1.4;
        color: #fef3c7;
      }

      /* Barra inferior con botones de acción */
      .cv-m2d-bottom-actions {
        display: flex;
        gap: 16px;
        width: 100%;
        z-index: 5020;
      }
      .cv-btn-explore-360 {
        flex: 2;
        background: linear-gradient(135deg, #be185d 0%, #e11d48 100%);
        border: none;
        border-radius: 14px;
        padding: 0.85rem 1.2rem;
        color: #ffffff;
        font-size: 0.92rem;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 4px 14px rgba(225, 29, 72, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: filter 0.15s ease, transform 0.15s ease;
      }
      .cv-btn-explore-360:hover {
        filter: brightness(1.1);
        transform: translateY(-2px);
      }
      .cv-btn-exit-visit {
        flex: 1;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 14px;
        padding: 0.85rem 1.2rem;
        color: #94a3b8;
        font-size: 0.9rem;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.15s ease, color 0.15s ease;
      }
      .cv-btn-exit-visit:hover {
        background: rgba(255, 255, 255, 0.12);
        color: #f8fafc;
      }
    `;
    screen.appendChild(style);

    const grecaTop = document.createElement("div");
    grecaTop.className = "cv-museum-greca top";
    const grecaBottom = document.createElement("div");
    grecaBottom.className = "cv-museum-greca bottom";

    const topNav = document.createElement("header");
    topNav.className = "cv-m2d-top-nav";

    const btnBack = document.createElement("button");
    btnBack.type = "button";
    btnBack.className = "cv-btn-change-culture";
    btnBack.textContent = "← Cambiar de Cultura";
    btnBack.addEventListener("click", () => {
      this.dispatch(NavigationAction.BACK_TO_SELECT);
    });

    const regionBadge = document.createElement("span");
    regionBadge.className = "cv-m2d-badge-region";
    regionBadge.id = "cv-m2d-badge-region";
    regionBadge.textContent = "SIERRA HUICHOLA";

    topNav.append(btnBack, regionBadge);

    const headerTitle = document.createElement("div");
    headerTitle.className = "cv-m2d-header-title";
    headerTitle.id = "cv-m2d-header-title";

    const tabsBar = document.createElement("nav");
    tabsBar.className = "cv-m2d-tabs-bar";
    tabsBar.id = "cv-m2d-tabs-bar";

    const exhibitCard = document.createElement("div");
    exhibitCard.className = "cv-m2d-exhibit-card";
    exhibitCard.id = "cv-m2d-exhibit-card";

    const bottomActions = document.createElement("footer");
    bottomActions.className = "cv-m2d-bottom-actions";

    const btnExplore360 = document.createElement("button");
    btnExplore360.type = "button";
    btnExplore360.className = "cv-btn-explore-360";
    btnExplore360.innerHTML = `👓 Explorar esta sala en 360°`;
    btnExplore360.addEventListener("click", () => {
      this.dispatch(NavigationAction.SELECT_VR);
    });

    const btnFinalize = document.createElement("button");
    btnFinalize.type = "button";
    btnFinalize.className = "cv-btn-exit-visit";
    btnFinalize.textContent = "Finalizar Visita";
    btnFinalize.addEventListener("click", () => {
      this.dispatch(NavigationAction.REQUEST_EXIT);
    });

    bottomActions.append(btnExplore360, btnFinalize);

    screen.append(
      grecaTop,
      grecaBottom,
      topNav,
      headerTitle,
      tabsBar,
      exhibitCard,
      bottomActions,
    );
    parent.appendChild(screen);
    this.container = screen;

    this.renderContent();
  }

  private renderContent(): void {
    if (!this.container) return;

    const cultureData = MUSEUM_DATA[this.currentCulture] || MUSEUM_DATA.wixarika;

    const namesMap: Record<CultureKey, { title: string; sub: string; region: string }> = {
      wixarika: {
        title: "Cultura Wixárika",
        sub: "Pueblo Sagrado de la Sierra Huichola",
        region: "SIERRA HUICHOLA",
      },
      naayeri: {
        title: "Cultura Náayeri",
        sub: "Pueblo Guerrero de El Nayar",
        region: "EL NAYAR",
      },
      odam: {
        title: "Cultura O'dam",
        sub: "Tepehuanos del Sur de Huajicori",
        region: "HUAJICORI Y SERRANÍAS",
      },
      mexicanero: {
        title: "Cultura Mexicanero",
        sub: "Nahuas de la Sierra Alta",
        region: "COMUNIDADES SERRANAS",
      },
    };

    const cur = namesMap[this.currentCulture];
    const regionBadge = this.container.querySelector<HTMLElement>("#cv-m2d-badge-region");
    if (regionBadge) regionBadge.textContent = cur.region;

    const headerTitle = this.container.querySelector<HTMLElement>("#cv-m2d-header-title");
    if (headerTitle) {
      headerTitle.innerHTML = `
        <h2>${cur.title}</h2>
        <p>${cur.sub}</p>
      `;
    }

    const tabsBar = this.container.querySelector<HTMLElement>("#cv-m2d-tabs-bar");
    if (tabsBar) {
      tabsBar.innerHTML = "";
      const tabs = [
        { id: "vestimenta", label: "Vestimenta", icon: "👘" },
        { id: "comidas", label: "Comidas", icon: "🍲" },
        { id: "tradiciones", label: "Tradiciones", icon: "✨" },
        { id: "artesanias", label: "Artesanías", icon: "🎨" },
        { id: "lenguaje", label: "Lenguaje", icon: "🗣️" },
      ];

      tabs.forEach((tab) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `cv-m2d-tab-btn ${this.activeCategory === tab.id ? "active" : ""}`;
        btn.innerHTML = `<span>${tab.icon}</span> ${tab.label}`;
        btn.addEventListener("click", () => {
          this.activeCategory = tab.id;
          this.renderContent();
        });
        tabsBar.appendChild(btn);
      });
    }

    const currentTopic = cultureData[this.activeCategory] || cultureData.vestimenta;
    const exhibitCard = this.container.querySelector<HTMLElement>("#cv-m2d-exhibit-card");
    if (exhibitCard) {
      exhibitCard.innerHTML = `
        <h3 class="cv-m2d-topic-title">${currentTopic.title}</h3>
        <p class="cv-m2d-topic-headline">${currentTopic.headline}</p>
        <div class="cv-m2d-items-grid">
          ${currentTopic.items
            .map(
              (item) => `
            <div class="cv-m2d-item-box">
              <h4>${item.name}</h4>
              <p>${item.shortDesc}</p>
              <div class="cv-m2d-why-badge">${item.whyText}</div>
            </div>
          `,
            )
            .join("")}
        </div>
      `;
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
      this.renderContent();
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