/** Website texts in Spanish (the reference: `en.ts` follows its shape). */
export const es = {
  meta: {
    title: 'diaryo — un diario infinito para tu PC',
    description:
      'Cada página es un lienzo sin límites para dibujar, escribir y conectar ideas. Libre, gratuito y de código abierto.',
  },
  nav: {
    features: 'Funciones',
    download: 'Descargar',
    source: 'Código',
    language: 'English',
  },
  hero: {
    title: 'Un diario infinito',
    subtitle:
      'Cada página es un lienzo sin límites para dibujar, escribir, rodear y conectar ideas. Libre, gratuito y pensado para tomar notas rápido desde el PC.',
    download: 'Descargar para Windows',
    tryWeb: 'Probar en el navegador',
  },
  footer: {
    openSource: 'Código abierto con licencia MIT.',
    privacy: 'Tus notas se quedan en tu equipo: diaryo no tiene cuentas ni servidores.',
  },
};

/** The shape of the website texts: the same for every language. */
export type WebMessages = Widen<typeof es>;

type Widen<T> = T extends string ? string : { [K in keyof T]: Widen<T[K]> };
