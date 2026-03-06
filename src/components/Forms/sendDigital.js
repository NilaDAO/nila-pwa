import QR from "../UI/qrCode";

const sendDigital = ({db}) => {
    
    return (
        <div className="flex flex-col w-full justify-center">
            <div className="mx-12">
            <QR digitalAddress={db['address']} />
            </div>
            <div className="mx-12">
            <p className="py-4 text-xs dark:text-slate-400">To send funds to your account, scan this QR code from another NILA app.</p>
            <p className="py-4 text-xs dark:text-slate-400">⚠️ Only your land title, nIN, USDt and Nila Food tokens will be visible. Any missing tokens do not mean they are not in your digital wallet.</p>
            </div>
        </div>
    );
}

export default sendDigital;
