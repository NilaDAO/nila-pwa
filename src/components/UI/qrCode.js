import { useEffect } from 'react';
const QRCode = require('qrcode');

const QR = ({digitalAddress}) => {

    useEffect(() => {
        QRCode.toDataURL(digitalAddress, { margin: 0, width: 280 }, (err, url) => {
          if (err) {
            console.error(err);
            return;
          }
          // This will be a base64 image string
          document.getElementById("qr").src = url; // Display in an <img> tag
        }) }, []);

    return (
        <img 
          id="qr" 
          style={{ filter: 'brightness(1.5)', border: '1px solid black'}}
          alt="QR Code" />
    )
}

export default QR
