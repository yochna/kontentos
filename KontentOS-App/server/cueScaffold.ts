// Cues for a clip whose speech nobody has captured yet.
//
// These lines are layout only: they hold the timing so a creator can see how a caption sits, and
// they stay brackets so nothing KontentOS wrote can be mistaken for words the creator spoke.
// The server never stores what this returns.

export function generateCueScaffold(title: string, durationSec: number = 10, targetLanguage: string = 'English') {
  const cleanTitle = (title || 'Creator Video').trim();
  const dur = Math.max(durationSec || 10, 4);

  const scriptsByLang: Record<string, string[]> = {
    English: [
      `[your opening line about ${cleanTitle}]`,
      `[what you actually say next]`,
      `[the point you are making]`,
      `[the proof you have for it]`,
      `[how you want it to end]`,
    ],
    Spanish: [
      `[tu frase inicial sobre ${cleanTitle}]`,
      `[lo que dices después]`,
      `[el punto que estás haciendo]`,
      `[la prueba que tienes]`,
      `[cómo quieres terminarlo]`,
    ],
    Hindi: [
      `[${cleanTitle} पर आपकी पहली पंक्ति]`,
      `[इसके बाद आप जो कहते हैं]`,
      `[आपका मुख्य बिंदु]`,
      `[आपके पास उसका प्रमाण]`,
      `[आप इसे कैसे खत्म करना चाहते हैं]`,
    ],
    French: [
      `[votre phrase d'accroche sur ${cleanTitle}]`,
      `[ce que vous dites ensuite]`,
      `[le point que vous défendez]`,
      `[la preuve que vous avez]`,
      `[comment vous voulez finir]`,
    ],
    German: [
      `[dein erster Satz zu ${cleanTitle}]`,
      `[was du als Nächstes sagst]`,
      `[der Punkt, den du machst]`,
      `[der Beweis dafür]`,
      `[wie du enden willst]`,
    ],
    Japanese: [
      `[${cleanTitle} に関する最初の一文]`,
      `[次に話す内容]`,
      `[主張しているポイント]`,
      `[その根拠]`,
      `[締めくくり方]`,
    ],
    Portuguese: [
      `[sua frase inicial sobre ${cleanTitle}]`,
      `[o que você diz em seguida]`,
      `[o ponto que você está fazendo]`,
      `[a prova que você tem]`,
      `[como você quer terminar]`,
    ],
    Chinese: [
      `[关于${cleanTitle}的开场句]`,
      `[你接下来说的话]`,
      `[你要表达的观点]`,
      `[你手上的证据]`,
      `[你打算怎么收尾]`,
    ],
  };

  const lines = scriptsByLang[targetLanguage] || scriptsByLang['English'];
  const numLines = Math.min(lines.length, Math.max(2, Math.floor(dur / 2)));
  const step = dur / numLines;

  function fmtSrtTime(totalSec: number): string {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = Math.floor(totalSec % 60);
    const ms = Math.floor((totalSec % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }

  const segments: Array<{ id: number; start: string; end: string; text: string }> = [];
  let srt = '';

  for (let i = 0; i < numLines; i++) {
    const startSec = i * step;
    const endSec = Math.min((i + 1) * step - 0.05, dur);
    const start = fmtSrtTime(startSec);
    const end = fmtSrtTime(endSec);
    const text = lines[i % lines.length];

    segments.push({ id: i + 1, start, end, text });
    srt += `${i + 1}\n${start} --> ${end}\n${text}\n\n`;
  }

  const transcript = lines.slice(0, numLines).join(' ');
  return { srt: srt.trim(), transcript, segments };
}
