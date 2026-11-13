// ---------------------------------------------------------------------------
// Words on screen. Few on purpose: the birds, the light and the sound carry the
// rest. English and Hindi; ?lan=hi (or ?lang=hi) picks one, anything unknown
// falls back to English. Elements carry data-i18n="key".
// ---------------------------------------------------------------------------
import { param } from './util.js';

const STRINGS = {
  en: {
    'title.kicker': 'three rules · one sky',
    'title.tag': 'Lead them home before the light goes.',
    'title.begin': 'Tap to begin',
    'title.best': 'Most brought home: {n}',
    'hint.lead': 'Drag, and they follow',
    'hint.lead.mouse': 'Move, and they follow',
    'hint.gather': 'Sweep up the wanderers',
    'hint.flare': 'Tap to scatter!',
    'hint.flare.mouse': 'Click to scatter!',
    'roost.call': 'Bring them home',
    'pause.title': 'Paused', 'pause.resume': 'Resume', 'pause.restart': 'Start again',
    'sound.on': 'Sound on', 'sound.off': 'Sound off',
    'rules.1': 'Keep apart.', 'rules.2': 'Fly the same way.', 'rules.3': 'Stay close.',
    'rules.note': 'Every bird follows these three rules and nothing else. You are the fourth: the way home.',
    'result.home': 'came home', 'result.again': 'Again',
    'result.best': 'Your best: {n}', 'result.new': 'The most you have brought home',
    'rank.0': 'A few stragglers', 'rank.1': 'A whisper', 'rank.2': 'A murmur', 'rank.3': 'A murmuration',
  },
  hi: {
    'title.kicker': 'तीन नियम · एक आसमान',
    'title.tag': 'रोशनी ढलने से पहले इन्हें घर ले चलो।',
    'title.begin': 'शुरू करने के लिए छुएँ',
    'title.best': 'अब तक सबसे ज़्यादा घर लौटे: {n}',
    'hint.lead': 'उँगली घुमाओ, झुंड पीछे आएगा',
    'hint.lead.mouse': 'माउस घुमाओ, झुंड पीछे आएगा',
    'hint.gather': 'भटके पंछियों को साथ ले लो',
    'hint.flare': 'बिखरने के लिए टैप करो!',
    'hint.flare.mouse': 'बिखरने के लिए क्लिक करो!',
    'roost.call': 'इन्हें घर ले चलो',
    'pause.title': 'रुका हुआ', 'pause.resume': 'जारी रखें', 'pause.restart': 'फिर से शुरू करें',
    'sound.on': 'ध्वनि चालू', 'sound.off': 'ध्वनि बंद',
    'rules.1': 'दूरी रखो।', 'rules.2': 'एक ही दिशा में उड़ो।', 'rules.3': 'पास रहो।',
    'rules.note': 'हर पंछी बस यही तीन नियम मानता है। चौथा नियम तुम हो: घर का रास्ता।',
    'result.home': 'घर लौटे', 'result.again': 'फिर से',
    'result.best': 'आपका सर्वश्रेष्ठ: {n}', 'result.new': 'अब तक सबसे ज़्यादा घर लौटे',
    'rank.0': 'कुछ भटके पंछी', 'rank.1': 'छोटा झुंड', 'rank.2': 'बड़ा झुंड', 'rank.3': 'महा झुंड',
  },
};

const want = (param('lan') || param('lang') || 'en').toLowerCase();
export const lang = STRINGS[want] ? want : 'en';
export const t = (key, vars) => {
  let s = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  if (vars) for (const k in vars) s = s.replace(`{${k}}`, vars[k]);
  return s;
};
export function applyI18n(root = document) {
  document.documentElement.lang = lang;
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
}
