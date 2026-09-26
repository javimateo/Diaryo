/** Website texts in Spanish (the reference: `en.ts` follows its shape). */
export const es = {
  meta: {
    title: 'diaryo — un diario infinito para tu PC',
    description:
      'Cada día, una doble página sin límites para escribir, dibujar, pegar post-its y unir ideas. Gratis y con el código a la vista.',
  },
  nav: {
    features: 'Funciones',
    download: 'Descargar',
    privacy: 'Privacidad',
    source: 'GitHub',
    downloadShort: 'Descargar',
    downloadWindows: 'Descargar para Windows',
    toDark: 'Cambiar a modo oscuro',
    toLight: 'Cambiar a modo claro',
  },
  hero: {
    tagline: 'tu diario, sin márgenes',
    title: 'Cada día, una doble página infinita.',
    subtitle:
      'Escribe, dibuja, pega post-its y une ideas con flechas en un diario de verdad. Y cuando lo necesites, aparece sobre tu escritorio con un atajo.',
    download: 'Descargar para Windows',
    /** `{version}` and `{size}` are filled in. */
    downloadInfo: 'v{version} · {size} · gratis',
    tryWeb: 'Usar en el navegador',
    points: ['Código a la vista', 'Sin cuentas', 'Tus notas no salen de tu PC'],
  },
  /** What is written in the diary of the hero. */
  book: {
    today: 'hoy',
    heading: 'Plan del finde',
    tasks: ['preguntar a Ana', 'comprar pan', 'grabar los vídeos'],
    doneTask: 1,
    boxed: '¿playa o monte?',
    pageNote: '↙ tira de la esquina para ver ayer',
    deskNote: 'Por hacer: terminar la web',
    shortcutNote: 'Ctrl+Alt+D y aparece',
    alt: 'Un diario abierto sobre una mesa de madera, con tareas, flechas y post-its.',
  },
  /** The live demo of the hero (the same texts on its pages as `book`). */
  demo: {
    live: 'En directo · no se guarda nada',
    canvas: 'Demo del diario: escribe, dibuja y pasa la página',
    tools: 'Herramientas',
    undo: 'Deshacer',
    redo: 'Rehacer',
    yesterday: {
      heading: 'Ideas sueltas',
      list: '- una web para diaryo\n- aprender acuarela\n- llamar a los abuelos',
      note: '¡Cumple de Marta el sábado!',
    },
  },
  strip: [
    { title: 'Hecho a mano', text: 'Motor de dibujo propio, fluido con miles de trazos.' },
    { title: 'Código a la vista', text: 'Léelo, cámbialo y compártelo, sin fines comerciales.' },
    { title: 'Sin cuentas ni nube', text: 'Todo se guarda en tu ordenador, con copias diarias.' },
    { title: 'Español e inglés', text: 'Eliges el idioma en Ajustes.' },
  ],
  features: {
    eyebrow: 'Funciones',
    title: 'Un diario que no se queda en un cajón',
    floating: {
      title: 'El diario flotante',
      text: 'Desde cualquier programa, Ctrl+Alt+D abre el diario sobre tu escritorio. Apuntas algo y el mismo atajo lo esconde. Sin buscar ventanas.',
    },
    desk: {
      title: 'Post-its en tu escritorio',
      text: 'Lo que dejas en la mesa del diario se queda en el fondo de Windows, detrás de las ventanas: tus tareas a la vista y la página de hoy en pequeño.',
      notes: ['llamar a Ana', 'regar las plantas', 'reunión a las 5'],
    },
    /** What is written in the animated scenes. */
    scenes: {
      today: 'hoy',
      day: 'sábado 26',
      turn: {
        // One double page per day: Saturday's two pages, then Sunday's.
        left: ['sábado 26', '· playa', '· cine'],
        front: ['· llamar a Ana', '· regar'],
        back: ['domingo 27', '· paseo'],
        under: ['· museo', '· cena'],
      },
      draw: {
        heading: 'Plan del finde',
        question: '¿playa o monte?',
        tasks: ['llamar a Ana', 'reservar hotel'],
        note: 'Hotel Mar · 80 €',
        link: '↪ viernes 2',
      },
      search: {
        query: 'playa',
        results: [
          ['sábado 26', '¿playa o monte?'],
          ['martes 8 jul', 'fotos de la playa'],
          ['tarea', 'comprar crema de sol'],
        ],
      },
      styles: [
        ['Cuero teja', 'Rayas', 'Madera'],
        ['Tela azul', 'Cuadrícula', 'Corcho'],
        ['Cartón', 'Puntos', 'Lino'],
      ],
    },
    small: [
      {
        id: 'turn',
        title: 'Pasar la página',
        text: 'Un día por página. Tiras de la esquina y la hoja se dobla como el papel.',
      },
      {
        id: 'draw',
        title: 'Dibujar y conectar',
        text: 'Rodea, subraya y une con flechas ideas, tareas y post-its; y enlaza con otros días.',
      },
      {
        id: 'map',
        title: 'Mapa y búsqueda',
        text: 'Todo el diario de un vistazo. Ctrl+K encuentra cualquier palabra, día o tarea.',
      },
      {
        id: 'style',
        title: 'A tu gusto',
        text: 'Tapas de cuero o tela, papel de rayas, cuadros, Cornell o agenda, y mesa de madera, corcho o lino.',
      },
    ],
  },
  download: {
    eyebrow: 'Descargar',
    title: 'diaryo para Windows',
    text: 'Windows 10 y 11, 64 bits. Se instala sin permisos de administrador y arranca con Windows, escondido y listo para el atajo.',
    button: 'Descargar v{version}',
    releases: 'Novedades y versiones anteriores',
    otherSystems: '¿Mac o Linux? Por ahora, úsalo en el navegador.',
    otherSystemsNoWeb: '¿Mac o Linux? Por ahora solo hay versión para Windows.',
    copyLink: 'Copiar el enlace para el PC',
    copied: 'Enlace copiado',
    onPhone: 'Estás en el móvil: copia el enlace y ábrelo en tu ordenador.',
    smartscreen: {
      title: '¿Sale un aviso azul de Windows?',
      text: 'Es SmartScreen: sale con programas nuevos que aún no ha visto mucha gente. El código de diaryo es público y puedes revisar lo que hace.',
      press: 'Pulsa',
      steps: ['Más información', 'Ejecutar de todas formas'],
    },
  },
  privacy: {
    eyebrow: 'Privacidad',
    title: 'Tus notas son tuyas',
    text: 'Sin cuentas, sin servidores y sin anuncios. El diario se guarda en tu ordenador y cada día deja una copia en Documentos. Puedes llevártelo entero en un archivo cuando quieras.',
    source: 'Ver el código en GitHub',
  },
  faq: {
    title: 'Preguntas frecuentes',
    items: [
      {
        q: '¿Es gratis?',
        a: 'Sí, del todo: sin anuncios ni versiones de pago. Y su código es público (para uso no comercial).',
      },
      {
        q: '¿Dónde se guardan mis notas?',
        a: 'En tu ordenador. La app de escritorio deja además una copia cada día en Documentos\\diaryo (puedes elegir otra carpeta).',
      },
      { q: '¿Funciona sin internet?', a: 'Sí. diaryo no necesita conexión para nada.' },
      {
        q: '¿Paso mi diario de un ordenador a otro?',
        a: 'Guarda una copia (un archivo .diaryo) desde el menú y ábrela en el otro.',
      },
      {
        q: '¿Y la versión web?',
        a: 'Es la misma app. Guarda el diario en tu navegador: nada sale de él.',
        web: true,
      },
    ],
  },
  webApp: {
    title: '¿Sin instalar nada?',
    text: 'La app completa también funciona en el navegador.',
    button: 'Abrir la app web',
  },
  footer: {
    made: 'Hecho con cariño · Código disponible para uso no comercial',
    language: 'English',
  },
};

/** The shape of the website texts: the same for every language. */
export type WebMessages = Widen<typeof es>;

type Widen<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : { [K in keyof T]: Widen<T[K]> };
