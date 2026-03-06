import React, { useState } from "react";
import "./ripple_effect.css";

const RippleEffect = ({ children }) => {
  const [rippleStyle, setRippleStyle] = useState({});

  const handleClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const size = Math.sqrt(rect.width ** 2 + rect.height ** 2) * 0.25; 
    const x = rect.width / 2 - size / 2;
    const y = rect.height / 2 - size / 2;

    setRippleStyle({
      top: `${y}px`,
      left: `${x}px`,
      width: `${size}px`,
      height: `${size}px`,
    });

    setTimeout(() => setRippleStyle({}), 500); // Clear after animation
  };

  return (
    <div className="ripple-container" onClick={handleClick}>
      {children}
      {rippleStyle.top && <span className="ripple" style={rippleStyle}></span>}
    </div>
  );
};

export default RippleEffect;
