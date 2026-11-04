// Read aloud (Anand, 4 Nov): the phone's own speech engine (Web Speech API, speechSynthesis), no library and no
// service; Tamil needs a Tamil voice on the phone (Android: Google text-to-speech, Tamil). Without one it says so.
import { useEffect, useState } from 'react';
import { C, FONT } from '../shell/tokens';
import { muted } from './ui';

const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;

/** The voices the phone has; filled when the engine has loaded them (Chrome loads them late). */
function useVoices() {
  const [voices, setVoices] = useState(() => synth?.getVoices() || []);
  useEffect(() => {
    if (!synth) return undefined;
    const load = () => setVoices(synth.getVoices());
    load();
    synth.addEventListener?.('voiceschanged', load);
    return () => synth.removeEventListener?.('voiceschanged', load);
  }, []);
  return voices;
}

/** A button that reads `text` in `lang` ('ta-IN' or 'en-IN'); a second tap stops it. */
export default function ReadAloud({ text, lang }) {
  const voices = useVoices();
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => synth?.cancel(), []);
  useEffect(() => { synth?.cancel(); setSpeaking(false); }, [text, lang]);
  if (!synth || !text) return null;
  const base = lang.slice(0, 2);
  const voice = voices.find((v) => v.lang?.replace('_', '-') === lang) || voices.find((v) => v.lang?.toLowerCase().startsWith(base));
  if (voices.length && !voice) {
    return <p style={{ ...muted, margin: '8px 0 0' }}>{base === 'ta' ? 'This phone has no Tamil voice to read it aloud. Add Tamil in the phone\'s text-to-speech settings.' : 'This phone has no voice to read it aloud.'}</p>;
  }
  const toggle = () => {
    if (speaking) { synth.cancel(); setSpeaking(false); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    if (voice) u.voice = voice;
    u.rate = 0.9;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(u);
    setSpeaking(true);
  };
  return (
    <button type="button" onClick={toggle} aria-pressed={speaking} style={{ width: '100%', height: 44, borderRadius: 12, border: 0, marginTop: 8,
      background: C.raised, color: C.text, fontWeight: 700, fontSize: 14, fontFamily: FONT, cursor: 'pointer' }}>
      {speaking ? 'Stop' : base === 'ta' ? 'கேளுங்கள் · Read aloud' : 'Read aloud'}
    </button>
  );
}
