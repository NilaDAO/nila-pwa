// The phone number field of R2 (board RegPhone-a6bc), shared with L14 (executive decision 22 Oct: one component):
// today's input with the country chip, +91 put in from the start (backspace changes it), checked with
// react-phone-number-input. Demo stack only: the dummy numbers 0000000000 … 3333333333 count as valid.
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import flags from 'react-phone-number-input/flags';
import '../components/UI/phone_input.css';
import { DEMO_COGNITO } from '../utils/demoMode';

// Any length from 6 digits (the input drops one leading 0, an Indian trunk prefix): all 0s, 1s, 2s or 3s.
export const demoNumber = (p) => { const m = /^\+91(0{5,10}|1{6,10}|2{6,10}|3{6,10})$/.exec(p || ''); return m ? `+91${m[1][0].repeat(10)}` : null; };
/** The number to send: the demo's dummy number made whole, else as typed. */
export const phoneValue = (p) => (DEMO_COGNITO && demoNumber(p)) || p;
export const phoneOk = (p) => !!p && (isValidPhoneNumber(p) || (DEMO_COGNITO && !!demoNumber(p)));

const PHONE_CSS = `.nl-phone{display:flex;align-items:center;gap:8px;width:100%}
.nl-phone .PhoneInputCountry{display:flex;align-items:center;gap:6px}
.nl-phone .PhoneInputCountrySelect{background:#1F2733;color:#F1F5F9}
.nl-phone .PhoneInputCountryIcon{width:24px;height:16px;border-radius:2px;overflow:hidden}
.nl-phone .PhoneInputCountrySelectArrow{color:#94A3B8}
.nl-phone .PhoneInputInput{flex:1;min-width:0;height:44px;padding:0;border:0;background:#1F2733!important;color:#FFFFFF!important;font-family:inherit;font-size:16px;outline:none}`;

/** value starts as '+91'; onChange gets '' when emptied. */
export default function PhoneField({ value, onChange, id, label = 'Phone number' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: 44, borderRadius: 12, background: '#1F2733', padding: '0 14px', boxSizing: 'border-box' }}>
      <style>{PHONE_CSS}</style>
      <PhoneInput id={id} className="nl-phone" international defaultCountry="IN" flags={flags} value={value} autoComplete="tel" aria-label={label}
        onChange={(v) => onChange(v || '')} />
    </div>
  );
}
