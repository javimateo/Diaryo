import type { WebMessages } from './es';

/** Website texts in English. */
export const en: WebMessages = {
  meta: {
    title: 'diaryo — an infinite diary for your PC',
    description:
      'Every day, a boundless double page to write, draw, stick notes and connect ideas. Free, with its code in the open.',
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
    points: ['Code in the open', "No account if you don't want one", 'Optional encrypted cloud'],
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
    { title: 'Code in the open', text: 'Read it, change it and share it, for non-commercial use.' },
    {
      title: 'Truly yours',
      text: 'On your computer, with daily backups. The cloud is optional and encrypted.',
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
      notes: ['call Ana', 'water the plants', 'meeting at 5'],
    },
    scenes: {
      today: 'today',
      day: 'Saturday 26',
      turn: {
        left: ['Saturday 26', '· beach', '· movies'],
        front: ['· call Ana', '· water plants'],
        back: ['Sunday 27', '· walk'],
        under: ['· museum', '· dinner'],
      },
      draw: {
        heading: 'Weekend plan',
        question: 'beach or mountains?',
        tasks: ['call Ana', 'book a hotel'],
        note: 'Hotel Mar · €80',
        link: '↪ Friday 2',
      },
      search: {
        query: 'beach',
        results: [
          ['Saturday 26', 'beach or mountains?'],
          ['Tuesday Jul 8', 'beach photos'],
          ['task', 'buy sunscreen'],
        ],
      },
      styles: [
        ['Terracotta leather', 'Lined', 'Wood'],
        ['Blue cloth', 'Grid', 'Cork'],
        ['Cardboard', 'Dots', 'Linen'],
      ],
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
        text: 'Circle, underline and link ideas, tasks and sticky notes with arrows; and link to other days.',
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
  cloud: {
    eyebrow: 'Cloud',
    title: 'On all your devices, and only you can read it',
    text: 'If you like, create an account and your diary syncs between your PC, the browser and your phone. Before it leaves your device it is encrypted with your diary password: the server only keeps unreadable data.',
    points: [
      {
        title: 'Optional',
        text: 'Without an account nothing changes: the diary lives on your computer.',
      },
      { title: 'End-to-end encrypted', text: "Not even the server's administrator can read it." },
      { title: '100 MB free', text: 'Years of text and drawings; images are compressed.' },
      { title: 'Offline too', text: 'You write as usual and it syncs when you are back.' },
    ],
    server: 'Server',
    caption: 'the same page, on both',
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
      text: "That's SmartScreen: it shows up for new programs not many people have run yet. diaryo's code is public and you can check what it does.",
      press: 'Click',
      steps: ['More info', 'Run anyway'],
    },
  },
  privacy: {
    eyebrow: 'Privacy',
    title: 'Your notes are yours',
    text: 'No ads and no tracking. The diary is saved on your computer and leaves a copy in Documents every day; you can take the whole thing with you in one file whenever you want. If you use the cloud, your diary travels encrypted: without your diary password nobody can read it, us included. This website only counts visits and downloads, anonymously and without cookies.',
    source: 'See the code on GitHub',
    policy: 'Privacy policy',
    terms: 'Terms',
  },
  faq: {
    title: 'Questions',
    items: [
      {
        q: 'Is it free?',
        a: 'Yes: the app is completely free, with no ads, and the cloud comes with 100 MB free. And its code is public (for non-commercial use).',
      },
      {
        q: 'Where are my notes saved?',
        a: 'On your computer. The desktop app also leaves a copy every day in Documents\\diaryo (you can pick another folder).',
      },
      {
        q: 'Does it work offline?',
        a: 'Yes. Only the cloud, if you use it, needs a connection to sync; meanwhile you write as usual.',
      },
      {
        q: 'Can I move my diary to another computer?',
        a: 'With the cloud (optional) it syncs by itself. Without it, save a copy (a .diaryo file) from the menu and open it on the other one.',
      },
      {
        q: 'Who can read my diary in the cloud?',
        a: 'Only you. It is encrypted on your device with your diary password before it leaves, and the server keeps unreadable data. Not even we can open it.',
      },
      {
        q: 'What if I forget my diary password?',
        a: "When you turn on the cloud you get a recovery code to keep. Without the password or the code, the cloud's diary can't be recovered; the one on your devices is still there.",
      },
      {
        q: 'What about the web version?',
        a: "It's the same app. It saves the diary in your browser; with the cloud, you also have it on your PC and your phone.",
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
    made: 'Made with care · Source available for non-commercial use',
    language: 'Español',
    privacy: 'Privacy',
    terms: 'Terms',
  },
  legal: {
    back: 'Back to diaryo',
    updated: 'Last updated: {date}',
    summary: 'In short',
  },
};
