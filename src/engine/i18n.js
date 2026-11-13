// ---------------------------------------------------------------------------
// Words on screen. Few on purpose: the triangle, the birds and the light carry
// the rest. English and Hindi; ?lan=hi (or ?lang=hi) picks one, anything unknown
// falls back to English. Elements carry data-i18n="key".
// The maths vocabulary follows the NCERT Class 10 textbook in each language.
// ---------------------------------------------------------------------------
import { param } from './util.js';

const STRINGS = {
  en: {
    'title.kicker': 'heights & distances',
    'title.tag': 'Lead them home before the light goes.',
    'title.begin': 'Tap to begin',
    'title.best': 'Most brought home: {n}',
    'title.grade': 'Class 10 · Some Applications of Trigonometry',
    // the six questions
    'q.H': 'How high are they?',
    'q.D': 'How far out are they?',
    'q.S': 'How long is the line of sight?',
    'q.A': 'What is the angle of elevation?',
    'q.F': 'How far out will it come down?',
    'q.T': 'How tall is the tree?',
    // the triangle's words (shown once, as each part is drawn)
    'word.horizontal': 'horizontal', 'word.sight': 'line of sight', 'word.elev': 'angle of elevation', 'word.dep': 'angle of depression',
    'w.h': 'height', 'w.d': 'distance', 'w.L': 'line of sight',
    // what happened
    'out.perfect': 'Perfect', 'out.low': 'Too low', 'out.high': 'Too high', 'out.short': 'Too short', 'out.far': 'Too far',
    'out.clear': 'It missed', 'out.hit': 'It struck', 'out.late': 'Too late',
    // the idea a wrong answer was missing (never the answer)
    'm.inv': 'tan θ = opposite ÷ adjacent. Is the side you want on top, or underneath?',
    'm.ratio': 'Which two sides are in play here? Use the ratio that joins exactly those two.',
    'm.value': 'Right ratio. Now check its value for this angle.',
    'm.hyp': 'That is the length of the line of sight, the slanted side.',
    'm.side': 'That is the other side of the triangle, not the line of sight.',
    'm.longest': 'The line of sight is the longest side of the triangle.',
    'm.swap': 'Compare the two sides. Is the height longer than the distance, or shorter?',
    'm.other': 'Mark the side opposite the angle and the side next to it. Which ratio joins them?',
    'm.one': '40 m is the gap between the lamps, not the distance to the tree.',
    'm.x': 'That is how far the near lamp is from the tree. How tall is the tree?',
    'hint.finish': 'Now finish it.',
    'hint.working': 'Here is the working.',
    'work.alt': 'Angle of depression from above = angle of elevation from below',
    // nudges
    'hint.lead': 'Drag to lead them to the lamp',
    'hint.lead.mouse': 'Move to lead them to the lamp',
    'hint.scouts': 'Choose. The scouts fly your answer.',
    'hint.gap': 'Choose where to open the flock',
    'roost.call': 'Bring them home',
    'pause.title': 'Paused', 'pause.resume': 'Resume', 'pause.restart': 'Start again',
    'sound.on': 'Sound on', 'sound.off': 'Sound off',
    'rules.1': 'Keep apart.', 'rules.2': 'Fly the same way.', 'rules.3': 'Stay close.',
    'rules.note': 'Every bird follows these three rules and nothing else. You are the fourth: the way home.',
    'result.home': 'came home', 'result.again': 'Again',
    'result.first': '{a} of {b} right on the first try',
    'result.best': 'Your best: {n}', 'result.new': 'The most you have brought home',
    'rank.0': 'A few stragglers', 'rank.1': 'A whisper', 'rank.2': 'A murmur', 'rank.3': 'A murmuration',
  },
  hi: {
    'title.kicker': 'ऊँचाइयाँ और दूरियाँ',
    'title.tag': 'रोशनी ढलने से पहले इन्हें घर ले चलो।',
    'title.begin': 'शुरू करने के लिए छुएँ',
    'title.best': 'अब तक सबसे ज़्यादा घर लौटे: {n}',
    'title.grade': 'कक्षा 10 · त्रिकोणमिति के कुछ अनुप्रयोग',
    'q.H': 'वे कितनी ऊँचाई पर हैं?',
    'q.D': 'वे कितनी दूरी पर हैं?',
    'q.S': 'दृष्टि रेखा कितनी लंबी है?',
    'q.A': 'उन्नयन कोण कितना है?',
    'q.F': 'बाज़ कितनी दूरी पर उतरेगा?',
    'q.T': 'पेड़ कितना ऊँचा है?',
    'word.horizontal': 'क्षैतिज रेखा', 'word.sight': 'दृष्टि रेखा', 'word.elev': 'उन्नयन कोण', 'word.dep': 'अवनमन कोण',
    'w.h': 'ऊँचाई', 'w.d': 'दूरी', 'w.L': 'दृष्टि रेखा',
    'out.perfect': 'एकदम सही', 'out.low': 'बहुत नीचे', 'out.high': 'बहुत ऊपर', 'out.short': 'बहुत कम', 'out.far': 'बहुत आगे',
    'out.clear': 'बाज़ चूक गया', 'out.hit': 'बाज़ ने झपट्टा मारा', 'out.late': 'देर हो गई',
    'm.inv': 'tan θ = सम्मुख भुजा ÷ संलग्न भुजा। जो भुजा चाहिए वह ऊपर है या नीचे?',
    'm.ratio': 'यहाँ कौन-सी दो भुजाएँ हैं? वही अनुपात लो जो इन्हीं दोनों को जोड़ता है।',
    'm.value': 'अनुपात सही है। अब इस कोण के लिए उसका मान जाँचो।',
    'm.hyp': 'यह तो दृष्टि रेखा की लंबाई है, तिरछी भुजा।',
    'm.side': 'यह त्रिभुज की दूसरी भुजा है, दृष्टि रेखा नहीं।',
    'm.longest': 'दृष्टि रेखा त्रिभुज की सबसे लंबी भुजा होती है।',
    'm.swap': 'दोनों भुजाओं की तुलना करो। ऊँचाई दूरी से बड़ी है या छोटी?',
    'm.other': 'कोण की सम्मुख भुजा और संलग्न भुजा पहचानो। कौन-सा अनुपात इन्हें जोड़ता है?',
    'm.one': '40 m दोनों दीपों के बीच की दूरी है, पेड़ तक की नहीं।',
    'm.x': 'यह पास वाले दीप से पेड़ की दूरी है। पेड़ कितना ऊँचा है?',
    'hint.finish': 'अब इसे पूरा करो।',
    'hint.working': 'यह रहा पूरा हल।',
    'work.alt': 'ऊपर से अवनमन कोण = नीचे से उन्नयन कोण',
    'hint.lead': 'उँगली घुमाकर इन्हें दीप तक ले चलो',
    'hint.lead.mouse': 'माउस घुमाकर इन्हें दीप तक ले चलो',
    'hint.scouts': 'चुनो। आगे के पंछी तुम्हारे उत्तर पर उड़ेंगे।',
    'hint.gap': 'चुनो, झुंड कहाँ से हटे',
    'roost.call': 'इन्हें घर ले चलो',
    'pause.title': 'रुका हुआ', 'pause.resume': 'जारी रखें', 'pause.restart': 'फिर से शुरू करें',
    'sound.on': 'ध्वनि चालू', 'sound.off': 'ध्वनि बंद',
    'rules.1': 'दूरी रखो।', 'rules.2': 'एक ही दिशा में उड़ो।', 'rules.3': 'पास रहो।',
    'rules.note': 'हर पंछी बस यही तीन नियम मानता है। चौथा नियम तुम हो: घर का रास्ता।',
    'result.home': 'घर लौटे', 'result.again': 'फिर से',
    'result.first': '{b} में से {a} पहली बार में सही',
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
