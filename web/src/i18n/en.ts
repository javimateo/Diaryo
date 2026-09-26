import type { WebMessages } from './es';

/** Website texts in English. */
export const en: WebMessages = {
  meta: {
    title: 'diaryo — an infinite diary for your PC',
    description:
      'Every day, a boundless double page to write, draw, stick notes and connect ideas. Free and open source.',
  },
  nav: {
    features: 'Features',
    download: 'Download',
    privacy: 'Privacy',
    source: 'GitHub',
    downloadShort: 'Download',
    downloadWindows: 'Download for Windows',
    toDark: 'Switch to dark mode',
    toLight: 'Switch to light mode',
  },
  hero: {
    tagline: 'your diary, no margins',
    title: 'Every day, an infinite double page.',
    subtitle:
      'Write, draw, stick notes and connect ideas with arrows in a real diary. And whenever you need it, it pops up over your desktop with a shortcut.',
    download: 'Download for Windows',
    downloadInfo: 'v{version} · {size} · free',
    tryWeb: 'Use it in the browser',
    points: ['Open source', 'No accounts', 'Your notes never leave your PC'],
  },
  book: {
    today: 'today',
    heading: 'Weekend plan',
    tasks: ['ask Ana', 'buy bread', 'record the videos'],
    doneTask: 1,
    boxed: 'beach or mountains?',
    pageNote: '↙ pull the corner to see yesterday',
    deskNote: 'To do: finish the website',
    shortcutNote: "Ctrl+Alt+D and it's there",
    alt: 'An open diary on a wooden desk, with tasks, arrows and sticky notes.',
  },
  demo: {
    live: 'Live · nothing is saved',
    canvas: 'Diary demo: write, draw and turn the page',
    tools: 'Tools',
    undo: 'Undo',
    redo: 'Redo',
    yesterday: {
      heading: 'Loose ideas',
      list: '- a website for diaryo\n- learn watercolor\n- call grandma and grandpa',
      note: "Marta's birthday on Saturday!",
    },
  },
  strip: [
    { title: 'Handmade', text: 'Its own drawing engine, smooth with thousands of strokes.' },
    { title: 'Open source', text: 'MIT license. Read it, change it, share it.' },
    {
      title: 'No accounts, no cloud',
      text: 'Everything is saved on your computer, with daily backups.',
    },
    { title: 'English and Spanish', text: 'Pick the language in Settings.' },
  ],
  features: {
    eyebrow: 'Features',
    title: "A diary that doesn't stay in a drawer",
    floating: {
      title: 'The floating diary',
      text: 'From any program, Ctrl+Alt+D opens the diary over your desktop. Jot something down and the same shortcut hides it. No hunting for windows.',
    },
    desk: {
      title: 'Sticky notes on your desktop',
      text: 'Whatever you leave on the diary’s desk stays on the Windows background, behind your windows: your tasks in sight and today’s page in small.',
      notes: ['call Ana', 'water plants', 'meeting at 5'],
    },
    small: [
      {
        id: 'turn',
        title: 'Turn the page',
        text: 'One day per page. Pull the corner and the sheet bends like paper.',
      },
      {
        id: 'draw',
        title: 'Draw and connect',
        text: 'Pencil, marker, shapes, arrows that follow what they join and tasks with checkboxes.',
      },
      {
        id: 'map',
        title: 'Map and search',
        text: 'The whole diary at a glance. Ctrl+K finds any word, day or task.',
      },
      {
        id: 'style',
        title: 'Make it yours',
        text: 'Leather or cloth covers, lined, grid, Cornell or planner paper, and a wood, cork or linen desk.',
      },
    ],
  },
  download: {
    eyebrow: 'Download',
    title: 'diaryo for Windows',
    text: 'Windows 10 and 11, 64-bit. Installs without admin rights and starts with Windows, hidden and ready for the shortcut.',
    button: 'Download v{version}',
    releases: 'Release notes and older versions',
    otherSystems: 'Mac or Linux? For now, use it in the browser.',
    otherSystemsNoWeb: 'Mac or Linux? For now there is only a Windows version.',
    copyLink: 'Copy the link for your PC',
    copied: 'Link copied',
    onPhone: "You're on your phone: copy the link and open it on your computer.",
    smartscreen: {
      title: 'A blue Windows warning?',
      text: "That's SmartScreen: it shows up for new programs not many people have run yet. diaryo is open source and you can check what it does.",
      press: 'Click',
      steps: ['More info', 'Run anyway'],
    },
  },
  privacy: {
    eyebrow: 'Privacy',
    title: 'Your notes are yours',
    text: 'No accounts, no servers and no ads. The diary is saved on your computer and leaves a copy in Documents every day. You can take the whole thing with you in one file whenever you want.',
    source: 'See the code on GitHub',
  },
  faq: {
    title: 'Questions',
    items: [
      { q: 'Is it free?', a: 'Completely: no ads and no paid versions. And open source (MIT).' },
      {
        q: 'Where are my notes saved?',
        a: 'On your computer. The desktop app also leaves a copy every day in Documents\\diaryo (you can pick another folder).',
      },
      { q: 'Does it work offline?', a: "Yes. diaryo doesn't need a connection for anything." },
      {
        q: 'Can I move my diary to another computer?',
        a: 'Save a copy (a .diaryo file) from the menu and open it on the other one.',
      },
      {
        q: 'What about the web version?',
        a: "It's the same app. It saves the diary in your browser: nothing leaves it.",
        web: true,
      },
    ],
  },
  webApp: {
    title: 'Nothing to install?',
    text: 'The full app works in the browser too.',
    button: 'Open the web app',
  },
  footer: {
    made: 'Made with care, open source · MIT',
    language: 'Español',
  },
};
