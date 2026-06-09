import React, { useState, useRef, useEffect } from 'react';
import { ArrowRightCircleIcon, ChevronDownIcon, ChevronUpIcon, CheckCircleIcon } from '@heroicons/react/20/solid'
import PhoneInput from 'react-phone-number-input'
import { isValidPhoneNumber } from 'react-phone-number-input'
import flags from 'react-phone-number-input/flags'
import './phone_input.css';
import { subscribeUser, unsubscribeUser, getSubscriptionStatus, syncSubscription } from '../../features/apis/pushManager'

// INPUT FORMS USED FOR SIGNIN/UP
const MobilePhoneInput = ({ inputValue, handleChange }) => {
  return (
    <form>
      <PhoneInput
        flags={flags}
        placeholder="Enter phone number"
        value={inputValue}
        autoComplete="tel"
        className="phone-input border text-sm dark:bg-slate-400 rounded-md focus:ring-2 focus:ring-green"
        onFocus={() => {
          // Pre-fill country code on focus; user can delete if needed
          if (!inputValue) handleChange('+91');
        }}
        onChange={handleChange}
      />
    </form>
  )
}

export const CollapseButton = ({ handleCollapse,isCollapsed,ix }) => {
  return (
    <button className="w-full text-center" onClick={handleCollapse}>
        <div className="flex justify-center">
            {isCollapsed && ix !== 5 ? (
                <ChevronUpIcon className={`h-4 w-4 dark:text-white`} />
            ) : (
                <ChevronDownIcon className={`h-4 w-4 dark:text-white`} />
            )}
        </div>
    </button>
  )
}

const PinCodeInput = ({ handleChange, backpage }) => {
  const inputsRef = useRef([]);

  useEffect(() => {
    const handlePaste = async (e) => {
      e.preventDefault();
      const text = await navigator.clipboard.readText();
      if (/^\d{6}$/.test(text)) {
        text.split("").forEach((char, i) => {
          if (inputsRef.current[i]) {
            inputsRef.current[i].value = char;
            handleChange({ target: inputsRef.current[i] });
          }
        });
        inputsRef.current[5]?.focus();
      }
    };

    inputsRef.current.forEach((input) => {
      if (input) input.addEventListener("paste", handlePaste);
    });

    return () => {
      inputsRef.current.forEach((input) => {
        if (input) input.removeEventListener("paste", handlePaste);
      });
    };
  }, [handleChange]);

  const handleInput = (e, index) => {
    const input = e.target;
    const value = input.value.replace(/\D/g, ""); // Allow only numbers
    input.value = value;
    handleChange(e);

    if (value && index < 5) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (e, index) => {
    if (e.key === "Backspace" && !e.target.value && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  return (
    <form className="flex flex-col my-3">
      <p className="text-sm dark:text-white">Enter the SMS code we sent to you.</p>
      <div className="flex my-2 space-x-2 rtl:space-x-reverse">
        {[...Array(6)].map((_, i) => (
          <input
            key={i}
            ref={(el) => (inputsRef.current[i] = el)}
            type="text"
            inputMode="numeric"
            pattern="\d*"
            maxLength="1"
            id={`code-${i}`}
            onInput={(e) => handleInput(e, i)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className="w-9 h-9 py-3 text-sm text-center dark:bg-darkgrey dark:text-white text-gray-900 bg-slate-100 border border-slate-400 rounded-lg focus:ring focus:ring-blue-300"
            required
          />
        ))}
      </div>
      <p onClick={backpage} className="text-xs text-gray-500 cursor-pointer">
        Sorry, I didn’t receive anything.
      </p>
    </form>
  );
};


export const DisableNotifications = ({ onAdd, address, compact = false }) => {
  
  const handleSubscriptionSignoff = async () => {
    console.log('unsubscribe user from notifications')
    if (!('Notification' in window)) return alert('No Notifications API');
    // fire the push manager
    console.log('fire push on address', address)
    try {
      const res = await unsubscribeUser(address)
      console.log('unsubscribe result', res)
      onAdd('denied')
      console.log('unsubscribe succeeded')
    } catch (err) {
      console.error('unsubscribe failed', err)
      alert('Unable to disable notifications. Please try again.')
    }
  }

  return compact ? (
    <div className="flex flex-col gap-2">
      <p className="font-bold text-xs dark:text-white text-left">Your union can send you notifications.</p>
      <div className="flex gap-3 justify-center my-3">
        <button onClick={handleSubscriptionSignoff} className="px-4 py-2 rounded-2xl bg-black dark:bg-white text-white dark:text-black text-xs font-bold active:scale-[0.98]">Disable</button>
      </div>
    </div>
  ) : (
    <div className="flex flex-col items-center mx-6 my-6 h-full justify-center">
          <p className='b-3 dark:text-white'>Your union can send you notifications.</p>
          <ClaimButton handleClick={handleSubscriptionSignoff} title={'disable'} />
    </div>
  )
}

export const EnableNotifications = ({ onAdd, address, autoResolve = true, compact = false }) => {
  // Optionally auto-resolve on mount (skip if caller wants to keep user on this page)
  useEffect(() => {
    if (!autoResolve) return;
    (async () => {
      const status = await getSubscriptionStatus();
      // If blocked by the user, don't show enable UI
      if (status.permission === 'denied') {
        onAdd('denied');
        return;
      }
      // If already subscribed, optionally resync server and advance UI
      if (status.permission === 'granted' && status.hasSub) {
        try { await syncSubscription(address); } catch {}
        onAdd('granted');
      }
    })();
  }, [address, onAdd, autoResolve]);

  const handleSubscriptionSignup = async () => {
    if (!('Notification' in window)) return alert('No Notifications API');
    if (Notification.permission === 'denied') {
      alert('You previously blocked notifications. Enable them in your browser or phone settings first.');
      onAdd('denied');
      return;
    }
    try {
      const res = await subscribeUser(address);
      if (res === 2) {
        alert('You explicitly denied notifications. You need to first enable them in your browser settings.');
        onAdd('denied');
      }
      else if (res === 0) {
        onAdd('granted');
      } else {
        alert('Unable to enable notifications. Please try again.');
        onAdd('denied');
      }
    } catch (err) {
      console.error('subscribe failed', err);
      onAdd('denied');
      alert('Unable to enable notifications. Please try again.');
    }
  };

  const handleSkipNotifications = () => {
    if (confirm('We recommend you enable notifications, specifically if you take out a loan. You can enable notifications in settings.')) {
      onAdd('skipped');
    }
  };

  return compact ? (
    <div className="flex flex-col gap-2">
      <p className="font-bold text-xs dark:text-white text-left">Your union would like to send you updates.</p>
      <div className="flex gap-3 justify-center my-3">
        <button onClick={handleSubscriptionSignup} className="px-4 py-2 rounded-2xl bg-black dark:bg-white text-white dark:text-black text-xs font-bold active:scale-[0.98]">Enable</button>
        <button onClick={handleSkipNotifications} className="px-4 py-2 rounded-2xl bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 text-black dark:text-white text-xs font-bold active:scale-[0.98]">Skip</button>
      </div>
    </div>
  ) : (
    <div className="flex flex-col items-center m-12 justify-center">
      <p className='b-3 dark:text-white' >Your union would like to send you updates.</p>
      <ClaimButton handleClick={handleSubscriptionSignup} title={'enable'} />
      <ClaimButton handleClick={handleSkipNotifications} title={'skip'} color={'white'} />
    </div>
  );
};

export const InputButton = ({ onAdd, page, backpage, handleRightClick, confirm }) => {
  const [inputValue, setInputValue] = useState('');
  const [isValid, setisValid] = useState(false);

  const handleChange = (event) => {
    // phone number
    if (page < 3 && event) {
      setisValid(isValidPhoneNumber(event))
      setInputValue(event)
      // OTC code
    } else if (page > 2) {
      let digit = event.target.value
      // wait untill 5 digits, verify 5 and hit handleRightClick
      if (!digit) {
        setInputValue(inputValue.slice(0, -1));
      }
      else {
        setInputValue(inputValue + digit)
      }
    }
  }

  useEffect(() => {
    if (inputValue.length === 6 && page > 2) {
      console.log('CHECKCEHCEK')
      setisValid(true)
      // check if code is valid, then handleRightClick
    }
  }, [handleChange]);


  const handleSave = () => {
    onAdd(inputValue);
    setInputValue('');  // Clear the input after saving
    setisValid(false)
    handleRightClick(inputValue)
  }

  return (
    <div className="flex flex-col z-10 justify-between w-full font-bold p-5">
      {page < 3 ?
        <MobilePhoneInput inputValue={inputValue} handleChange={handleChange} /> :
        <PinCodeInput inputValue={inputValue} backpage={backpage} handleChange={handleChange} />
      }
      <div className="flex flex-row justify-end">
        <button onClick={handleSave} className={`flex font-bold text-sm items-center pr-5 ${isValid ? 'dark:text-white' : 'text-grey dark:text-slate-400'}`}>{confirm}</button>
        <button onClick={handleSave} className='flex flex-row text-sm'>
          <ArrowRightCircleIcon className='h-9 dark:text-slate-400' />
        </button>
      </div>
    </div>
  )
}

export const PendingButton = ({ handleRightClick, title }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (count > 3) {
      console.log('finished loading..')
      handleRightClick()
    }
  }, [count]);

  useEffect(() => {
    const id = setInterval(() => setCount((oldCount) => oldCount + 1), 2000);
    return () => {
      clearInterval(id);
    }
  }, []);

  return (
    <div className="flex p-5">
      <p onClick={handleRightClick}>{title[count]}</p>
    </div>
  )
}

// FORMS USED FOR IN-APP UI
export const IndividualExchangeButton = ({ disabled_add, disabled_remove, handleTx, texts }) => {
  const [last, setLast] = useState(null)    // 'add' or 'remove'
  const [cnt, setCnt] = useState(0)

  const doAction = (type) => {
    const action = type === 0 ? 'add' : 'remove'
    setCnt(prev => last === action ? prev + 1 : 1)
    setLast(action)
    handleTx(type)
  }

  const doMax = () => {
    if (cnt < 5 || !last) return
    // fast step: only send the string action so downstream can apply the larger step once
    handleTx(last)
  }

  const mode = cnt >= 5 ? last : null

  const MinusBtn = () => (
    <div className="flex flex-col items-center">
      <button
        onClick={() => doAction(1)}
        disabled={disabled_remove}
        className={`mb-2 ${disabled_remove ? 'opacity-20' : ''} text-white bg-black dark:bg-slate-400 font-bold rounded-full h-11 w-11 mx-1`}
      >–</button>
      <p className={`text-sm ${disabled_remove ? 'opacity-40' : ''}`}>{texts.minus}</p>
    </div>
  )

  const PlusBtn = () => (
    <div className="flex flex-col items-center">
      <button
        onClick={() => doAction(0)}
        disabled={disabled_add}
        className={`mb-2 ${disabled_add ? 'opacity-20' : ''} text-white bg-black dark:bg-slate-400 font-bold rounded-full h-11 w-11 mx-1`}
      >+</button>
      <p className={`text-sm ${disabled_add ? 'opacity-40' : ''}`}>{texts.plus}</p>
    </div>
  )

  const MaxBtn = () => (
    <div className="flex flex-col items-center">
      <button
        onClick={doMax}
        hidden={mode === 'add' ? disabled_add : disabled_remove}
        className="mb-2 text-white bg-black dark:bg-slate-400 font-bold rounded-full h-11 w-11 mx-1"
      >
        {mode === 'add' ? '++' : '--'}
      </button>
      <p className="text-sm" hidden={mode === 'add' ? disabled_add : disabled_remove} >more</p>
    </div>
  )

  // build list: for remove-mode put Max first, then minus/plus; for add-mode put minus/plus then Max
  const buttons = []
  if (mode === 'remove') buttons.push(<MaxBtn key="max" />)
  buttons.push(<MinusBtn key="minus" />, <PlusBtn key="plus" />)
  if (mode === 'add') buttons.push(<MaxBtn key="max" />)

  return (
    <div className="flex justify-center mt-6 dark:text-white">
      {buttons}
    </div>
  )
}

export const ExchangeButton = ({ disabled, handleTx, texts }) => (
  <div className={`flex justify-center mt-6`}>
    <div className="flex flex-col items-center">
      <button disabled={disabled} onClick={() => handleTx(0)} className={`mb-2 ${!disabled ? '' : 'opacity-20'} text-white dark:text-white bg-black dark:bg-slate-400 font-bold rounded-full h-12 w-12 mx-2`}>+</button>
      <p className={`text-sm dark:text-white ${!disabled ? '' : 'opacity-40'}`}>{texts.plus}</p>
    </div>
    <div className="flex flex-col items-center">
      <button disabled={disabled} onClick={() => handleTx(1)} className={`mb-2 ${!disabled ? '' : 'opacity-20'} text-white dark:text-white bg-black dark:bg-slate-400 font-bold rounded-full h-12 w-12 mx-2`}>-</button>
      <p className={`text-sm dark:text-white ${!disabled ? '' : 'opacity-40'}`}>{texts.minus}</p>
    </div>
  </div>
)

export const ClaimButton = ({
  hidden,
  disabled,
  handleClick,
  title,
  color,
  extrasmall,
  compact,
  fullWidth,
  tooltip,
  dataTour,
  pendingTitle = 'Working...',
  successTitle,
  successDurationMs = 1200,
}) => {
  const [pending, setPending] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const runClick = async (e) => {
    if (disabled || pending) return;
    try {
      const res = handleClick?.(e);
      if (res && typeof res.then === 'function') {
        setPending(true);
        await res;
        if (successTitle) {
          setShowSuccess(true);
          setTimeout(() => {
            if (mountedRef.current) setShowSuccess(false);
          }, successDurationMs);
        }
      }
    } catch (err) {
      console.error('ClaimButton click failed', err);
    } finally {
      if (mountedRef.current) setPending(false);
    }
  };

  const label = showSuccess ? successTitle : pending ? pendingTitle : title;

  return (
    <div className={fullWidth ? 'flex flex-1' : `flex justify-center ${compact ? 'my-2' : 'mt-4'} max-h-12`}>
      <button
        hidden={hidden}
        disabled={disabled || pending}
        onClick={runClick}
        aria-busy={pending}
        title={tooltip}
        data-tour={dataTour}
        className={`mb-2 ${fullWidth ? 'w-full' : ''} ${disabled || pending ? 'opacity-40 cursor-not-allowed' : ''} ${color === 'white' ? 'text-black dark:text-white bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600' : 'text-white dark:text-black bg-black dark:bg-white'} ${compact ? 'text-xs px-4 py-2' : `${extrasmall ? 'text-xs' : 'text-sm'} px-6 py-2`} font-bold rounded-2xl no-wrap inline-flex items-center justify-center gap-2 active:scale-[0.98]`}
      >
        {pending && (
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        {label}
      </button>
    </div>
  );
}

export const SlideToggle = ({
  isOn,
  handleToggle,
  onTitle,
  offTitle,
  }) => (
    <button
      onClick={handleToggle}
      className="relative bg-gray-100 dark:bg-slate-600 rounded-3xl py-2 w-[50%] overflow-hidden select-none"
    >
      {/* sliding knob */}
      <div className={`absolute inset-y-0 w-1/2 bg-black dark:bg-white rounded-3xl transition-transform
                      ${isOn ? 'translate-x-full rounded-r-full' : 'translate-x-0 rounded-l-full'}`
      }
      />

      {/* labels */}
      <div className="relative z-10 flex w-full text-sm font-bold">
        <span className={`flex-1 text-center ${isOn ? 'text-black dark:text-slate-400' : 'text-white dark:text-black'}`}>
          {onTitle}
        </span>
        <span className={`flex-1 text-center ${!isOn ? 'text-black dark:text-slate-400' : 'text-white dark:text-black'}`}>
          {offTitle}
        </span>
      </div>
    </button>
);

export const SimpleFormButton = (props) => {
  return (
    <div className="flex z-10 justify-center font-bold p-5">
      <button onClick={props.handleClick}>{props.title}</button>
    </div>
  )
}

export const SelectListButton = ({ onAdd, handleClick, languageList }) => {
  const handleSave = (e) => {
    onAdd(e);
    handleClick()
  }

  return (
    <div className="flex flex-col z-10 p-5">
      {languageList.map((l, i) => (
        <button key={i} onClick={() => handleSave(i)} className="py-5 text-sm text-left">{l}</button>
      ))}
    </div>
  )
}

export function RateSlider({
  type,
  decimals,
  min = 1,
  max,
  step = 0.1,
  initial,
  onSet,
  onChange = () => { }
}) {
  const [value, setValue] = useState(initial);
  const [color, setColor] = useState('bg-gray-300');
  const percent = ((value - min) / (max - min)) * 100;

  const handleChange = (e) => {
    const v = parseFloat(e.target.value);
    setValue(v);
    onChange(v);
    setColor(v < initial ? 'bg-red' : v <= (initial + 3) ? 'bg-gray-300' : 'bg-green')
  };

  return (
    <div className='flex flex-row w-[85%] items-center' >
      <div className="relative w-full h-10">
        {/* Track */}
        <div className="absolute top-1/2 left-0 w-full h-px bg-gray-300 rounded" style={{ transform: 'translateY(-50%)' }} />
        {/* Filled portion */}
        <div
          className={`absolute top-1/2 left-0 h-px ${color} rounded`}
          style={{
            width: `${percent}%`,
            transform: 'translateY(-50%)'
          }}
        />
        {/* Value label */}
        <div
          className="absolute -top-2 transform -translate-x-1/2 text-xs font-medium text-black dark:text-white leading-none"
          style={{ left: `${percent}%` }}
        >
          {type === 'percentage' || type === 'kg' ? value?.toFixed(decimals) : value}
          {type === 'percentage' ? '%' : type === 'kg' ? 'kg' : ''}
        </div>
        {/* Knob dot — centered on the track line */}
        <div
          className={`absolute top-1/2 transform -translate-x-1/2 -translate-y-1/2 w-5 h-5 ${color} border border-gray-400 rounded-full shadow`}
          style={{ left: `${percent}%` }}
        />
        {/* Invisible native input to handle dragging */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleChange}
          className="absolute top-1/2 left-0 w-full h-px opacity-0 cursor-pointer"
          style={{ transform: 'translateY(-50%)' }}
        />
      </div>
      <CheckCircleIcon onClick={onSet} className='w-8 h-8 mx-2 dark:text-white' />
    </div>
  );
}

export function DropdownButtonLoans({ options, onSelect, z, color, resolveName }) {
  const [open, setOpen] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState('');
  const ref = useRef();

  const formatBorrower = (loan) => {
    if (!loan) return '';
    if (resolveName) return resolveName(loan.borrower);
    return loan.borrower ? `${loan.borrower.slice(0, 6)}...${loan.borrower.slice(-4)}` : '';
  };

  const PHENOSTAGES = {
    0: 'bud development',
    1: 'leaf development',
    3: 'shoot development',
    5: 'inflorescence emergence',
    6: 'flowering',
    7: 'fruit development',
    8: 'fruit maturing',
    9: 'scenescence/dormancy',
  }

  useEffect(() => {
    const onClickOutside = e => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', onClickOutside);
    return () => document.removeEventListener('click', onClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative w-full">
      <button className={`flex p-4 flex-row w-full ${color === 'white' ? 'bg-gray-200 dark:bg-slate-800' : 'bg-black'} justify-between`} onClick={() => setOpen(o => !o)}>
        <p className='mx-12 dark:text-white'>borrower: {formatBorrower(selectedLoan)}</p>
        {!open ? <ChevronDownIcon className="w-7 h-7 dark:text-white " /> : <ChevronUpIcon className="w-7 h-7 dark:text-white" />}
      </button>
      {open && options && (
        <ul className={`left-0 z-${z} py-3 w-full bg-white dark:bg-slate-800 text-black max-h-[60vh] overflow-y-auto shadow-lg rounded-md`}>
          {options.map((opt, i) => (
            <li
              key={i}
              onClick={() => { 
                if (opt.active){
                  onSelect(opt);
                  setOpen(false);
                  setSelectedLoan(opt)
                }
              }}
              className={`pointer p-4`}
            >
              <>
              <div className='flex flex-col dark:text-white mx-12'>
                <div className={`flex flex-row font-bold justify-between ${!opt.active && 'line-through text-gray-400'}`}>
                  <p>{formatBorrower(opt)}</p>
                  <p>{(opt.amount ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })} nIN</p>
                </div>
                <p className="text-gray-400"> stage: {!opt.active ? 'Repaid' : opt.maturityTs ? 'harvested' : PHENOSTAGES[opt?.activity_stage_id] || 'no activity detected'} </p>
              </div>
              </>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DropdownButton({ options, onSelect, z, color, compact }) {
  const [open, setOpen] = useState(false);
  const [selectedFund, setSelectedFund] = useState(() => options?.[0]?.[1] ?? '');
  const ref = useRef();

  // Pre-select the first option on mount so callers don't need to re-click
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  useEffect(() => {
    if (options?.[0]) {
      onSelectRef.current?.(options[0]);
    }
  }, []);

  useEffect(() => {
    const onClickOutside = e => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', onClickOutside);
    return () => document.removeEventListener('click', onClickOutside);
  }, []);

  const pad = compact ? 'px-3 py-2' : 'p-4';
  const textSize = compact ? 'text-xs' : '';
  const iconSize = compact ? 'w-4 h-4' : 'w-7 h-7';

  return (
    <div ref={ref} className="relative w-full">
      <button className={`flex ${pad} flex-row w-full rounded-xl items-center ${color === 'white' ? 'bg-gray-100 dark:bg-slate-600' : 'bg-black dark:bg-gray-800'} justify-between`} onClick={() => setOpen(o => !o)}>
        <p className={`dark:text-white ${textSize}`}>{selectedFund}</p>
        {!open ? <ChevronDownIcon className={iconSize} /> : <ChevronUpIcon className={iconSize} />}
      </button>
      {open && (
        <ul className={`absolute left-0 z-${z} py-1 w-full bg-white dark:bg-gray-800 text-black rounded-xl shadow-lg`}>
          {options.map((opt, i) => (
            <li
              key={i}
              onClick={() => {
                onSelect(opt);
                setOpen(false);
                setSelectedFund(opt[1])
              }}
              className={`cursor-pointer ${compact ? 'px-3 py-2 text-xs' : 'p-4'} dark:text-white hover:bg-gray-100 dark:hover:bg-slate-700 ${opt[3] && 'line-through'} `}
            >
              {(opt[4] != null ? opt[4] + ' ' : '') + opt[1]}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AmountInput({
  value,
  initial,
  onChange,
  color,
  onSet
}) {
  const v = !value ? initial : value
  const [raw, setRaw] = useState(v);

  const formatterNIN = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'nIN',
    minimumFractionDigits: 0
  });

  const formatterINR = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0
  });

  const handleInput = e => {
    // strip non-numeric chars, parse to number
    const num = parseFloat(e.target.value.replace(/[^\d.-]/g, '')) || 0;
    setRaw(num);
    onChange(num);
  };

  const measureAmount = (raw) => {
    switch (true) {
      case raw < 100:
        return '⚠️ This fund has a minimum of 1000.'
      case raw < initial:
        return 'That is fine, you decide.'
      case raw === initial:
        return '❗That is the maximum this fund can provide.'
      case raw > initial:
        return '⚠️ Your loan needs to be approved by your union.'
      default:
        return ''
    }
  }

  return (
    <div className='flex flex-col items-start'>
      <div className='m-6' >
        <div className='flex flex-row items-center'>
          <input
            type="text"
            id="currency"
            value={formatterNIN.format(raw)}
            onChange={handleInput}
            className={`"w-min-1/2 ${raw < 101 || raw > 10000 ? 'bg-red' : color === 'white' ? 'bg-gray-300 text-black' : 'bg-black' } p-2 border rounded`}
          />
          <CheckCircleIcon onClick={onSet} className='w-9 h-9 mx-3' />
        </div>
        <p className='p-1 text-xs'>{formatterINR.format(raw)}/-</p>
      </div>
      <p className={`text-xs ${color === 'white' ? 'text-black dark:text-white' : ''} px-6 py-3`}>{measureAmount(raw)}</p>
    </div>
  );
}
