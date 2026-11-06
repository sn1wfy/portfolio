// A small shell on a cold machine. Everything printed goes through textContent; nothing typed is ever parsed as HTML.
//
// initTerminal(el, ctx) -> { dispose() }

const HOST = 'snow@varna';
const PROMPT = `${HOST}:~$ `;

const LINKS = {
  github: { href: 'https://github.com/sn1wfy', label: 'github.com/sn1wfy' },
  instagram: { href: 'https://instagram.com/sn1wfy', label: 'instagram.com/sn1wfy' },
  omnexis: { href: 'https://omnexis.net', label: 'omnexis.net' },
};

/* ── Content ────────────────────────────────────────────────────────
   A line is a string, or an array of segments. A segment is a string or
   { t: text, c: 'dim' | 'bright', href }. Prefix a whole line with
   { dim: [...] } or { bright: [...] } for convenience.                    */

const B = (t) => ({ t, c: 'bright' });
const D = (t) => ({ t, c: 'dim' });
const A = (key, label) => ({ t: label || LINKS[key].label, href: LINKS[key].href });
const GH = (path, label) => ({ t: label || `github.com/sn1wfy/${path}`, href: `https://github.com/sn1wfy/${path}` });

const FILES = {
  'beliefs.txt': [
    [D('# beliefs.txt  (last edited at night, as usual)')],
    '',
    '1. the world should be more open and more connected.',
    '2. own your tools. if you can\'t host it, you\'re renting it.',
    '3. understand the system under the system.',
    '4. programming is one way to change things. not the only one.',
    '5. talk to people, in their language if you can.',
    '6. discipline is a favour you do for your future self.',
  ],
  'now.txt': [
    [D('# now.txt')],
    '',
    ['building ', B('OmniTaxi'), ': taxi dispatch with no human dispatcher.'],
    ['running ', B('Omnexis'), ', the studio, here in Varna.'],
    'going deeper on distributed state, GDPR-grade data handling',
    'and self-hosted infrastructure.',
  ],
  'backmaster.md': [
    [B('# BackMaster'), D('  ·  C++17 · nftables · systemd · GTK')],
    'a host-security daemon for linux. a guard dog for my own machine.',
    'watches processes, sockets, DNS and the kernel ring buffer,',
    'enforces blocklists through nftables, and when something looks',
    'like a backdoor opening, a wolf pops up on my desktop.',
    'ships backmasterd, backmasterctl and systemd units.',
    [D('built after realising a game lobby could be someone\'s way in.')],
    ['→ ', GH('BackMaster')],
  ],
  'trufflepoint.md': [
    [B('# TrufflePoint'), D('  ·  ASP.NET Core 8 · SQL Server · Stripe · S3')],
    'a bilingual multi-seller marketplace. sellers and hunters meet.',
    'stripe checkout and webhooks, S3 media behind an eight-layer',
    'image validation pipeline, generated PDF contracts, seller payouts,',
    'live chat, bulgarian tax export.',
    [D('~56k lines of C#. private. the biggest thing I\'ve built alone.')],
  ],
  'omnitaxi.md': [
    [B('# OmniTaxi'), D('  ·  in progress  ·  ASP.NET Core 8 · PostgreSQL · SignalR · Redis · OSRM')],
    'taxi dispatch with nobody at the switchboard.',
    'every five seconds a reconciliation loop offers each waiting ride',
    'to the nearest free driver, ranked by real road time from a',
    'self-hosted OSRM matrix. versioned tariffs, an enforced ride',
    'state machine, bilingual BG/EN.',
    [D('private. still being built, mostly after dark.')],
  ],
  'bodpie.md': [
    [B('# Bodpie'), D('  ·  Node.js · Express · EJS · Helmet')],
    'a product site on express: layouts, rate limiting, validation,',
    'transactional email. the rail on the left of this page was born',
    'from its navigation.',
  ],
  'port-scanner.md': [
    [B('# Port-Scanner'), D('  ·  C# · .NET')],
    'async, multi-threaded TCP scanner with SemaphoreSlim throttling.',
    'tells open, filtered and closed apart, on IPv4 and IPv6.',
    ['→ ', GH('Port-Scanner')],
  ],
  'portfolio.md': [
    [B('# portfolio'), D('  ·  HTML · CSS · JavaScript')],
    'this. hand-built, no framework, no trackers, no CDN.',
    'you are standing in it.',
    ['→ ', GH('portfolio')],
  ],
};
const PROJECT_FILES = ['backmaster.md', 'trufflepoint.md', 'omnitaxi.md', 'bodpie.md', 'port-scanner.md', 'portfolio.md'];

const INTERESTS = [
  ['self-hosting', 'digital freedom, owning your stack'],
  ['omnexis', 'a studio I\'m building in Varna'],
  ['law', 'how rules actually shape people'],
  ['psychology & philosophy', 'analytical thinking, why we do what we do'],
  ['hardware', 'the machine under the abstraction'],
  ['ai', 'the strangest tool we\'ve ever made'],
  ['business & money', 'entrepreneurship as applied systems design'],
  ['music, art, photography', 'the parts of me that don\'t compile'],
  ['languages & travel', 'bulgarian, english, and people everywhere'],
  ['fitness', 'discipline you can feel'],
  ['anime & fictional worlds', 'other universes, taken seriously'],
];

const WHOAMI = [
  ['martin nikolov. ', D('"snow" on this machine.')],
  'varna, on the black sea. backend and systems, mostly at night.',
  'I build things that keep running when nobody is watching.',
  'programming is one of the things I do. it isn\'t the whole of me.',
];

const COMMANDS = {
  help: 'this list',
  whoami: 'who\'s on the other side',
  about: 'what I\'m actually after',
  ls: 'look around  (ls projects)',
  cat: 'read a file  (cat beliefs.txt)',
  interests: 'what I spend my mind on',
  stack: 'what my hands reach for',
  neofetch: 'the machine, described by itself',
  moon: 'tonight\'s moon over Varna',
  date: 'what time it is here',
  uptime: 'how long this has been running',
  contact: 'where to find me',
  open: 'open github | instagram | omnexis',
  history: 'what you\'ve typed',
  echo: 'say something back',
  clear: 'clean slate',
  exit: 'try it',
};

/* ── Moon (same synodic arithmetic as the hero) ─────────────────── */
const SYNODIC = 29.530588853;
const EPOCH = Date.UTC(2000, 0, 6, 18, 14);
function moonPhase(date = new Date()) {
  const days = (date.getTime() - EPOCH) / 86400000;
  const age = ((days % SYNODIC) + SYNODIC) % SYNODIC;
  const illum = (1 - Math.cos((2 * Math.PI * age) / SYNODIC)) / 2;
  const names = ['new moon', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full moon', 'waning gibbous', 'last quarter', 'waning crescent'];
  const name = names[Math.floor(((age / SYNODIC) * 8) + 0.5) % 8];
  return { age, illum, name };
}
function moonArt(age, rows = 9) {
  const cols = Math.round(rows * 2.3) | 1;
  const k = Math.cos((2 * Math.PI * age) / SYNODIC);
  const waxing = age < SYNODIC / 2;
  const out = [];
  for (let j = 0; j < rows; j++) {
    const y = ((j + 0.5) / rows) * 2 - 1;
    const w = Math.sqrt(Math.max(0, 1 - y * y));
    const segs = [];
    for (let i = 0; i < cols; i++) {
      const x = ((i + 0.5) / cols) * 2 - 1;
      let ch = ' ', c = '';
      if (x * x + y * y <= 1) {
        const on = waxing ? x > k * w : x < -k * w;
        const limb = Math.sqrt(x * x + y * y);
        ch = on ? (limb > 0.86 ? '%' : '@') : '.';
        c = on ? 'bright' : 'faint';
      }
      const lastSeg = segs[segs.length - 1];
      if (lastSeg && lastSeg.c === c) lastSeg.t += ch; else segs.push({ t: ch, c });
    }
    out.push(segs);
  }
  return out;
}

function varnaDate() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Sofia', weekday: 'short', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', year: 'numeric', hour12: false, timeZoneName: 'short',
  }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { str: `${parts.weekday} ${parts.month} ${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${parts.timeZoneName} ${parts.year}`, hour: +parts.hour };
}

/* ── Styles ─────────────────────────────────────────────────────── */
function injectStyle() {
  if (document.getElementById('term-style')) return;
  const st = document.createElement('style');
  st.id = 'term-style';
  st.textContent = `
  .term { display:flex; flex-direction:column; cursor:text; position:relative; }
  .term-bar { flex:none; display:flex; align-items:center; gap:7px; height:38px; padding:0 16px;
    border-bottom:1px solid var(--line); background:rgba(255,255,255,.018); position:relative; user-select:none; cursor:default; }
  .term-bar i { width:9px; height:9px; border-radius:50%; background:#2f2f34; box-shadow:inset 0 0 0 1px rgba(255,255,255,.06); }
  .term-bar i:nth-child(2) { background:#3a3a40; } .term-bar i:nth-child(3) { background:#46464c; }
  .term-bar span { position:absolute; left:0; right:0; text-align:center; font:400 12px/38px var(--mono); color:var(--fg-3); letter-spacing:.04em; pointer-events:none; }
  .term-screen { flex:1 0 auto; height:440px; overflow-y:auto; overscroll-behavior:contain; padding:18px 22px 22px;
    scrollbar-width:thin; scrollbar-color:#2d2d32 transparent; }
  .term-screen::-webkit-scrollbar { width:8px; } .term-screen::-webkit-scrollbar-thumb { background:#2d2d32; border-radius:8px; }
  .term-log { margin:0; }
  .term-line { white-space:pre-wrap; word-break:break-word; min-height:1.7em; }
  .term-line.pre { white-space:pre; overflow-x:auto; word-break:normal; scrollbar-width:none; }
  .term-line.pre::-webkit-scrollbar { display:none; }
  .term-line.art { line-height:1.25; min-height:1.25em; }
  .term-sw { display:inline-block; width:1.6em; height:.9em; vertical-align:-.05em; }
  .term-line.in { animation: term-in .35s ease both; }
  @keyframes term-in { from { opacity:0; } to { opacity:1; } }
  .term .dim { color:var(--fg-2); }
  .term .faint { color:#3a3a40; }
  .term .bright { color:var(--fg-0); }
  .term .pr { color:var(--fg-2); }
  .term a { color:var(--silver); text-decoration:underline; text-decoration-color:rgba(216,219,224,.3); text-underline-offset:3px; }
  .term a:hover, .term a:focus-visible { color:#fff; text-decoration-color:rgba(255,255,255,.7); }
  .term-input { display:flex; white-space:pre; min-height:1.7em; }
  .term-field { position:relative; flex:1; min-width:0; white-space:pre-wrap; word-break:break-all; color:var(--fg-0); }
  .term-field input { position:absolute; inset:0; width:100%; height:100%; margin:0; padding:0; border:0; outline:0;
    background:transparent; color:transparent; caret-color:transparent; font:inherit; opacity:0; }
  .term-cur { display:inline-block; min-width:.62em; background:var(--silver); color:var(--ink-0); }
  .term.focused .term-cur { animation: term-blink 1.06s steps(1) infinite; }
  .term:not(.focused) .term-cur { background:transparent; color:var(--fg-0); box-shadow:inset 0 0 0 1px rgba(216,219,224,.55); }
  @keyframes term-blink { 50% { background:transparent; color:var(--fg-0); } }
  .term-input.busy .term-cur { animation:none; }
  @media (max-width: 820px) {
    .term-screen { height:min(380px, 62vh); padding:14px 16px 18px; font-size:12.5px; }
    .term-field input { font-size:16px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .term-line.in { animation:none; }
    .term.focused .term-cur { animation:none; }
  }`;
  document.head.appendChild(st);
}

/* ── Terminal ───────────────────────────────────────────────────── */
export function initTerminal(el, ctx = {}) {
  const reduced = !!ctx.reducedMotion;
  injectStyle();
  el.replaceChildren();

  const bar = document.createElement('div');
  bar.className = 'term-bar';
  bar.setAttribute('aria-hidden', 'true');
  bar.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
  const title = document.createElement('span');
  title.textContent = `${HOST}: ~`;
  bar.append(title);

  const screen = document.createElement('div');
  screen.className = 'term-screen';

  const log = document.createElement('div');
  log.className = 'term-log';
  log.setAttribute('role', 'log');
  log.setAttribute('aria-live', 'polite');
  log.setAttribute('aria-label', 'Terminal output');

  const inputLine = document.createElement('div');
  inputLine.className = 'term-input';
  const pr = document.createElement('span');
  pr.className = 'pr';
  pr.textContent = PROMPT;
  pr.setAttribute('aria-hidden', 'true');
  const field = document.createElement('label');
  field.className = 'term-field';
  const mirror = document.createElement('span');
  mirror.setAttribute('aria-hidden', 'true');
  const input = document.createElement('input');
  Object.assign(input, { type: 'text', autocomplete: 'off', spellcheck: false });
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('enterkeyhint', 'go');
  input.setAttribute('aria-label', `Terminal. Type a command and press Enter. Try help.`);
  field.append(mirror, input);
  inputLine.append(pr, field);

  screen.append(log, inputLine);
  el.append(bar, screen);

  const history = [];
  let hIndex = 0, draft = '';
  let busy = false;            // intro is typing
  let skip = false;            // user interrupted the intro
  const timers = new Set();

  /* rendering helpers */
  function segNode(seg) {
    if (typeof seg === 'string') return document.createTextNode(seg);
    let node;
    if (seg.href) {
      node = document.createElement('a');
      node.href = seg.href;
      node.target = '_blank';
      node.rel = 'noopener noreferrer';
    } else node = document.createElement('span');
    if (seg.c) node.className = seg.c;
    node.textContent = seg.t;
    return node;
  }
  function print(line, cls = '') {
    const div = document.createElement('div');
    div.className = `term-line${cls ? ' ' + cls : ''}${reduced ? '' : ' in'}`;
    const segs = Array.isArray(line) ? line : [line];
    for (const s of segs) div.appendChild(segNode(s));
    log.appendChild(div);
    return div;
  }
  const printAll = (lines, cls) => lines.forEach((l) => print(l, cls));
  function echoCommand(cmd) {
    const div = print([{ t: PROMPT, c: 'pr' }], '');
    div.appendChild(document.createTextNode(cmd)); // user text: textContent only
  }
  function scrollDown() { screen.scrollTop = screen.scrollHeight; }

  function renderMirror() {
    const v = input.value;
    const caret = input.selectionStart ?? v.length;
    const cur = document.createElement('span');
    cur.className = 'term-cur';
    cur.textContent = v[caret] || ' ';
    mirror.replaceChildren(document.createTextNode(v.slice(0, caret)), cur, document.createTextNode(v.slice(caret + 1)));
  }

  /* commands */
  function run(raw) {
    const line = raw.trim();
    echoCommand(raw);
    if (!line) return;
    history.push(line);
    const [first, ...rest] = line.split(/\s+/);
    const cmd = first.toLowerCase();
    const args = rest;
    const argStr = line.slice(first.length).trim();
    const lower = line.toLowerCase().replace(/\s+/g, ' ');

    if (/^(sudo )?rm (-[a-z]*r[a-z]*f[a-z]*|-[a-z]*f[a-z]*r[a-z]*|-r -f|-f -r) (\/|\/\*|~|\*|\.)$/.test(lower) || /^(sudo )?rm -rf --no-preserve-root/.test(lower)) {
      printAll([
        [D('backmasterd[812]: '), 'caught ', B('rm -rf /'), ' from a visitor tty. blocked.'],
        [D('backmasterd[812]: '), 'the wolf is awake now.'],
        'nice try. this machine has a guard dog, and I wrote it.',
      ]);
      return;
    }

    switch (cmd) {
      case 'help': {
        print([D('available commands, case doesn\'t matter. tab completes, ↑ ↓ for history.')]);
        const w = Math.max(...Object.keys(COMMANDS).map((k) => k.length)) + 3;
        for (const [k, d] of Object.entries(COMMANDS)) print([B(k.padEnd(w)), D(d)]);
        print([D('there are a few others. it\'s night; things howl.')]);
        break;
      }
      case 'whoami': printAll(WHOAMI); break;
      case 'about':
        printAll([
          'I\'d like the world to be more open and more connected:',
          'people owning their tools, understanding the systems around them,',
          'reaching each other across languages, borders and disciplines.',
          '',
          'code is one way in. so are law, philosophy, business,',
          'a good conversation, and a well-drawn frame of animation.',
          '',
          [D('I self-host almost everything I run. I like knowing where my data sleeps.')],
          [D('→ '), B('cat beliefs.txt')],
        ]);
        break;
      case 'ls': {
        const target = (args.find((a) => !a.startsWith('-')) || '').replace(/^~\/?|^\.\//, '').replace(/\/$/, '').toLowerCase();
        if (!target) print([B('projects/'), '  ', B('interests/'), '  beliefs.txt  now.txt']);
        else if (target === 'projects') print(PROJECT_FILES.join('  '));
        else if (target === 'interests') print(INTERESTS.map(([n]) => n.replace(/[ ,&]+/g, '-').replace(/-+/g, '-')).join('  '));
        else if (FILES[target] || FILES[target.replace(/^projects\//, '')]) print(target);
        else print(`ls: cannot access '${args[0]}': No such file or directory`);
        break;
      }
      case 'cat': {
        if (!args.length) { print([D('cat: give me a file. try '), B('cat beliefs.txt')]); break; }
        for (const a of args) {
          const key = a.toLowerCase().replace(/^~\/|^\.\//, '').replace(/^projects\//, '');
          if (FILES[key]) printAll(FILES[key]);
          else if (key === 'projects' || key === 'interests' || key === 'projects/' || key === 'interests/') print(`cat: ${a}: Is a directory`);
          else print(`cat: ${a}: No such file or directory`);
        }
        break;
      }
      case 'interests': {
        const w = Math.max(...INTERESTS.map(([n]) => n.length)) + 3;
        for (const [n, d] of INTERESTS) print([B(n.padEnd(w)), D(d)]);
        print([D('code is in there somewhere too. it doesn\'t need its own line.')]);
        break;
      }
      case 'stack':
        printAll([
          [B('backend   '), 'C# · .NET 8 · ASP.NET Core · EF Core · SignalR · Node.js · Express · C++ · Python · Go'],
          [B('frontend  '), 'JavaScript · TypeScript · React · Razor · EJS · jQuery · DataTables · Leaflet'],
          [B('data      '), 'PostgreSQL · SQL Server · Redis'],
          [B('metal     '), 'Arch Linux · Docker · nginx · systemd · Bash · Cloudflare Tunnel'],
          [B('guarding  '), 'nftables · JWT · BCrypt · Turnstile · GDPR flows'],
          [D('no CDN anywhere. every asset self-hosted.')],
        ]);
        break;
      case 'neofetch': neofetch(); break;
      case 'moon': {
        const m = moonPhase();
        moonArt(m.age, 9).forEach((segs) => print([' ', ...segs], 'pre art'));
        print('');
        print([B(m.name), D(` · ${Math.round(m.illum * 100)}% lit · day ${m.age.toFixed(1)} of ${SYNODIC.toFixed(1)}`)]);
        print([D(m.illum > 0.9 ? 'a bright one. the crows are out.' : m.illum < 0.1 ? 'almost nothing up there tonight. good for stars.' : 'over Varna, over the sea.')]);
        break;
      }
      case 'date': {
        const d = varnaDate();
        print(d.str);
        print([D(d.hour < 5 ? 'Varna. deep night. probably still awake.' : d.hour < 8 ? 'Varna. dawn over the Black Sea.' : d.hour < 18 ? 'Varna. daylight. not my best hours.' : d.hour < 22 ? 'Varna. evening is falling.' : 'Varna. night. the good part.')]);
        break;
      }
      case 'uptime': {
        const d = varnaDate();
        print(` ${d.str.split(' ')[3]}  up years, 1 user,  load average: 0.42, 0.37, 0.31`);
        print([D('since the first hello world. never cleanly rebooted.')]);
        break;
      }
      case 'contact':
        printAll([
          [B('github     '), A('github')],
          [B('instagram  '), A('instagram')],
          [B('omnexis    '), A('omnexis'), D('  work-for-hire lives there, not here')],
          [D('the door\'s open. say hi in bulgarian or english.')],
        ]);
        break;
      case 'open': {
        const key = (args[0] || '').toLowerCase();
        if (!LINKS[key]) { print([D('open: where to? '), B('github'), D(' | '), B('instagram'), D(' | '), B('omnexis')]); break; }
        print([D('opening '), A(key), D(' …')]);
        const w = window.open(LINKS[key].href, '_blank', 'noopener,noreferrer');
        if (w) w.opener = null;
        break;
      }
      case 'clear': log.replaceChildren(); break;
      case 'echo': print(argStr); break;
      case 'history':
        history.forEach((h, i) => print([D(String(i + 1).padStart(4) + '  '), h]));
        break;
      case 'sudo':
        printAll([
          [D('[sudo] password for visitor: ')],
          'nice try. sudo is for whoever pays the electricity bill here.',
          [D('this incident will be reported. to the crows.')],
        ]);
        break;
      case 'rm':
        print(argStr ? [D('rm: '), 'I\'d rather you didn\'t. everything here took a while.'] : 'rm: missing operand');
        break;
      case 'exit':
      case 'logout':
        printAll([
          'logout',
          [D('… just kidding. there\'s no exit, only the next night.')],
          [D('if you want the real door: '), B('contact')],
        ]);
        break;
      case 'howl':
      case 'wolf':
        printAll([
          [B('a-woooooooooooooo')],
          [D('somewhere on the desktop, a wolf from BackMaster answers.')],
        ]);
        break;
      case 'crow':
      case 'crows':
        print([D('caw.'), ' ', D('they\'re above the moon, if you scroll up.')]);
        break;
      case 'pwd': print('/home/snow'); break;
      case 'cd': print([D('cd: '), 'there\'s nowhere else to go. you\'re already home.']); break;
      case 'pacman':
      case 'yay':
        printAll([
          ':: Synchronizing package databases...',
          ' core is up to date',
          ' extra is up to date',
          [D('arch, by the way. it\'s always up to date. it has to be.')],
        ]);
        break;
      case 'vim': case 'vi': case 'nano': case 'emacs':
        print([D(`${cmd}: `), 'read-only filesystem for visitors. you can\'t get stuck in here either.']);
        break;
      case 'man': print([D('man: '), 'no manual. try ', B('help'), ', it\'s friendlier.']); break;
      case 'hello': case 'hi': case 'hey': case 'здравей': case 'здрасти':
        print(['hi. ', D('здравей. it\'s late, but I\'m around.')]);
        break;
      default:
        print(`bash: ${first}: command not found`);
    }
  }

  function neofetch() {
    const m = moonPhase();
    const art = moonArt(m.age, 12);
    const info = [
      [B('snow'), D('@'), B('varna')],
      [D('----------')],
      [B('OS         '), 'Arch Linux x86_64'],
      [B('Host       '), 'a box I host myself'],
      [B('Kernel     '), 'linux, rolling'],
      [B('Uptime     '), 'years, and counting'],
      [B('Shell      '), 'bash'],
      [B('Location   '), 'Varna, BG · Europe/Sofia'],
      [B('Languages  '), 'bulgarian, english'],
      [B('Code       '), '252,000 lines · C# 39.3%'],
      [B('Hosting    '), 'almost everything, at home'],
      [B('Moon       '), `${m.name}, ${Math.round(m.illum * 100)}%`],
    ];
    const greys = ['#0b0b0c', '#222226', '#3a3a40', '#5e5e64', '#8d8d93', '#c9c9cc', '#ececef', '#ffffff'];
    const swatches = (div) => greys.forEach((c) => {
      const sw = document.createElement('span');
      sw.className = 'term-sw';
      sw.style.background = c;
      div.appendChild(sw);
    });
    const width = Math.round(12 * 2.3) | 1;
    if (screen.clientWidth < 560) { // narrow: art above, info below, like neofetch on a small tty
      art.forEach((segs) => print([' ', ...segs], 'pre art'));
      print('');
      info.forEach((l) => print(l));
      swatches(print(''));
      return;
    }
    const rows = Math.max(art.length, info.length + 2);
    for (let r = 0; r < rows; r++) {
      const left = art[r] ? [' ', ...art[r]] : [' '.repeat(width + 1)];
      const div = print(left, 'pre art');
      div.appendChild(document.createTextNode('   '));
      if (info[r]) for (const s of info[r]) div.appendChild(segNode(s));
      else if (r === info.length + 1) swatches(div);
    }
  }

  /* completion */
  function complete() {
    const v = input.value;
    const parts = v.split(/\s+/);
    let pool, prefix;
    if (parts.length <= 1) {
      pool = [...Object.keys(COMMANDS), 'howl', 'moon'];
      prefix = parts[0].toLowerCase();
    } else {
      const c = parts[0].toLowerCase();
      prefix = parts[parts.length - 1].toLowerCase();
      if (c === 'cat') pool = ['beliefs.txt', 'now.txt', ...PROJECT_FILES, 'projects/'].concat(prefix.startsWith('projects/') ? PROJECT_FILES.map((f) => 'projects/' + f) : []);
      else if (c === 'ls') pool = ['projects/', 'interests/'];
      else if (c === 'open') pool = Object.keys(LINKS);
      else return;
    }
    const hits = [...new Set(pool)].filter((p) => p.startsWith(prefix));
    if (!hits.length) return;
    let common = hits[0];
    for (const h of hits) while (!h.startsWith(common)) common = common.slice(0, -1);
    const head = parts.slice(0, -1).join(' ');
    const done = hits.length === 1 && !common.endsWith('/');
    if (common.length > prefix.length || hits.length === 1) {
      input.value = (head ? head + ' ' : '') + common + (done ? ' ' : '');
    } else {
      echoCommand(v);
      print(hits.join('  '));
    }
    input.setSelectionRange(input.value.length, input.value.length);
    renderMirror(); scrollDown();
  }

  /* events */
  function onKey(e) {
    if (busy) { if (e.key === 'Tab') return; skip = true; e.preventDefault(); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = input.value;
      input.value = '';
      hIndex = history.length + 1; draft = '';
      run(v);
      hIndex = history.length;
      renderMirror(); scrollDown();
    } else if (e.key === 'Tab') {
      if (!input.value && e.shiftKey) return;
      if (!input.value) return; // let Tab move focus out when there's nothing to complete
      e.preventDefault();
      complete();
    } else if (e.key === 'ArrowUp') {
      if (!history.length) return;
      e.preventDefault();
      if (hIndex === history.length) draft = input.value;
      hIndex = Math.max(0, hIndex - 1);
      input.value = history[hIndex];
      input.setSelectionRange(input.value.length, input.value.length);
      renderMirror();
    } else if (e.key === 'ArrowDown') {
      if (!history.length) return;
      e.preventDefault();
      hIndex = Math.min(history.length, hIndex + 1);
      input.value = hIndex === history.length ? draft : history[hIndex];
      input.setSelectionRange(input.value.length, input.value.length);
      renderMirror();
    } else if (e.key.toLowerCase() === 'l' && e.ctrlKey) {
      e.preventDefault();
      log.replaceChildren();
    } else if (e.key.toLowerCase() === 'c' && e.ctrlKey && input.selectionStart === input.selectionEnd) {
      e.preventDefault();
      echoCommand(input.value + '^C');
      input.value = '';
      renderMirror(); scrollDown();
    }
  }
  const onInput = () => { renderMirror(); scrollDown(); };
  const onSel = () => requestAnimationFrame(renderMirror);
  const onFocus = () => { el.classList.add('focused'); renderMirror(); };
  const onBlur = () => el.classList.remove('focused');
  function onClick(e) {
    if (e.target.closest('a')) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && el.contains(sel.anchorNode)) return; // let people copy text
    if (busy) skip = true;
    input.focus({ preventScroll: true });
  }

  input.addEventListener('keydown', onKey);
  input.addEventListener('input', onInput);
  input.addEventListener('keyup', onSel);
  input.addEventListener('select', onSel);
  input.addEventListener('focus', onFocus);
  input.addEventListener('blur', onBlur);
  el.addEventListener('click', onClick);
  renderMirror();

  /* intro: types whoami the first time it's actually seen */
  const wait = (ms) => new Promise((r) => { if (skip || reduced) return r(); const id = setTimeout(() => { timers.delete(id); r(); }, ms); timers.add(id); });
  let disposed = false;
  async function intro() {
    busy = true;
    inputLine.classList.add('busy');
    print([D(`Last login: ${varnaDate().str.split(' ').slice(0, 4).join(' ')} from somewhere dark`)]);
    await wait(700);
    const cmd = 'whoami';
    for (const ch of cmd) {
      if (disposed) return;
      input.value += ch;
      input.setSelectionRange(input.value.length, input.value.length);
      renderMirror();
      await wait(90 + Math.random() * 90);
    }
    await wait(380);
    if (disposed) return;
    input.value = '';
    echoCommand(cmd);
    renderMirror();
    for (const l of WHOAMI) { print(l); scrollDown(); await wait(140); }
    await wait(300);
    print('');
    print([D('type '), B('help'), D(' to look around.')]);
    busy = false;
    inputLine.classList.remove('busy');
    renderMirror(); scrollDown();
  }

  let io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { io.disconnect(); io = null; intro(); }
  }, { threshold: 0.45 });
  io.observe(el);

  return {
    dispose() {
      disposed = true;
      timers.forEach(clearTimeout);
      if (io) io.disconnect();
      input.removeEventListener('keydown', onKey);
      input.removeEventListener('input', onInput);
      input.removeEventListener('keyup', onSel);
      input.removeEventListener('select', onSel);
      input.removeEventListener('focus', onFocus);
      input.removeEventListener('blur', onBlur);
      el.removeEventListener('click', onClick);
      el.replaceChildren();
      el.classList.remove('focused');
    },
  };
}
