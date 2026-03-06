import React, { useState, useEffect } from "react";
import { motion } from 'framer-motion';
import Header from "../wallet/Header";
import Loading from "./loadScreen";
import { getSuperteamCookie } from "./getSuperTeamCookie";
import { createItem } from '../../utils/db';
import { InputButton, EnableNotifications } from '../../components/UI/buttons';
import { signUp, getUserAttributes, initAuth, respondToAuthChallenge} from '../../utils/cognito_helpers'
import { InformationCircleIcon, WifiIcon } from '@heroicons/react/24/outline'
import MemberUnion from '../../components/Forms/memberUnion';
import { setMetaThemeColor } from '../../utils/metaTheme';

const RegisterRecover = ( { setBootStage }) => {
    const [ page, setPage ] = useState(0)  // TEMP 0 
    const [ url_attr, setAttr ] = useState(null)      
    const [ _address, setAddress ] = useState(null)      
    const [ session, setSession ] = useState()     
    const salt = Math.random().toString(36).substring(2, 15)       
    /**
     * Rendered when no session on PWA.
     * recover wallet
            - input phonenumber
            - if no salt, OTP verification, then SignIn and retreive salt
            - if salt, SignIn
     * create wallet
            - input phonenumber
            - OTP verification, get salt and store locally
            - 
     */

    useEffect(() => {
        setMetaThemeColor('#121212'); // wallet
        return () => setMetaThemeColor('#121212'); // optional cleanup
        }, []);

    // functions to pass through the create wallet flow.
    const languageList = ['नीला में आपका स्वागत है','welcome to Nila','নীলাতে স্বাগতম','નીલા માં આવકાર','ನೀಲಕ್ಕೆ ಸುಸ್ವಾಗತ','نیلاس منز خۆش آمدید','नीलामध्ये आपले स्वागत आहे','ਨੀਲਾ ਵਿੱਚ ਜੀ ਆਇਆਂ ਨੂੰ','நீலாவில் வரவேற்கிறேன்','నీలాకు స్వాగతం','نیلا میں خوش آمدید']
      
    useEffect(() => {
        const url_attr = getSuperteamCookie('superteam')
        if (url_attr['chain'] == 'null'){
            url_attr['chain'] = '137'
        }
        setAttr(url_attr)
    },[])

    const handleAddAttr = (attr) => {
        if (page < 3){
            url_attr['phone'] = attr
        } else {
            url_attr['otp'] = attr
        }
        console.log( 'uttr params', url_attr)
        setAttr(url_attr);
    }

    const handleSignUp = async (phone,chain) => {
        try {
            const response = await signUp(phone,chain)    
            console.log('user signed up...', response)
            const ses = await initAuth(phone)
            console.log('user initiated auth...', ses)
            setSession(ses.Session)                  
            setPage(3)
        } catch (error) {
            if (error.name === 'UsernameExistsException'){
                handleRecovery(phone)
                console.log('User exist, recover account')
            } else {
                console.log('ERROR:',error)
            }
    }}

    const handleRecovery = async (phone) => {
        try {
            const ses = await initAuth(phone)
            console.log('user initiated auth...', ses)
            setSession(ses.Session)                  
            setPage(4)
        } catch (error) {
            if (error.name === 'UserNotFoundException'){
                handleSignUp(phone,chain)
                console.log('User does not exist, signup')
            } else {
                console.log('ERROR:',error)
            }
    }}

    const handleLogin = async (type) => {
        /**
         * signUp and add Salt if CREATE, fallback to recover if phonenumber already exists
         * signIn if VERIFY, fallback to create if phonenumber does NOT exist
         */
        const phone = String(url_attr['phone'])
        const chain = url_attr['chain'] ? url_attr['chain'] : '137' // use Polygon as default chain
        console.log('handleSignalNewUser', phone)

        try {
            if( type === 'create'){
                handleSignUp(phone,chain)
            }
            else if (type === 'recover'){
                handleRecovery(phone,chain)
                }
        } catch (error) {
            console.error('Error during registration', error);
        }
    }

    const handleStoreLocalData = async (data,refresh_token, access_token, pushId) => {
        // set data from backend to local db

        // set locally retreived data
        await createItem({ id: 'phone', value: String(url_attr['phone'])},'Init'); // phone
        await createItem({ id: 'union', value: undefined },'Init'); // union
        await createItem({ id: 'salt', value: salt },'Init'); // salt
        await createItem({ id: 'refresh_token', value: refresh_token },'Init'); // temporary refresh token
        await createItem({ id: 'jwt_token', value: access_token },'Init'); // temporary jwt token

        // set empty items 
        await createItem({ id: 'withdrawal', value: undefined },'Init'); //banking data
        await createItem({ id: 'refin', value: undefined },'Init'); // refinance data
        await createItem({ id: 'backup', value: undefined },'Init'); // db backup
        await createItem({ id: 'farmname', value: undefined },'Init'); // farm name
        await createItem({ id: 'thumb', value: undefined },'FarmData') // SatImage card
        await createItem({ id: 'invest', value: undefined },'FarmData') // Invest list

        // set chain & address
        const address = data.find(attribute => attribute.Name === 'custom:address');
        const chain = data.find(attribute => attribute.Name === 'custom:chain');
        setAddress(address['Value'])
        await createItem({ id: 'chain', value: chain['Value']},'Init'); // chain
        await createItem({ id: 'address', value: address['Value'] },'Init'); // address

        console.log('data stored in new AppDB')
    }

    const handleVerifyOTP = async () => {
        /**
         * signUp and add Salt if CREATE, fallback to recover if phonenumber already exists
         * signIn if VERIFY, fallback to create if phonenumber does NOT exist
         */
        const phone = String(url_attr['phone'])
        const otp = url_attr['otp']
        try{
            // Step 2: Confirm OTP to verify phone number
            const response = await respondToAuthChallenge(phone,otp,session,salt)
            console.log("OTP verified:", response);

            // Step 3: retreive user attributes
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for 2 seconds for backend lamdbda to resolve
            const access_token = response.AuthenticationResult.AccessToken
            const refresh_token = response.AuthenticationResult.RefreshToken
            const attributes = await getUserAttributes(access_token)
            console.log("attributes", attributes);

            // Step 4: (re)set storage in indexedDB
            handleStoreLocalData(attributes.UserAttributes,refresh_token, access_token)
            setPage(5)

        } catch (error) {
            console.error('Error during registration', error);
        }
      };

    const handleGotoNotifications = () => {
        console.log('set notification', page, 'perm:', Notification.permission)
        // Always show the notification step so the user can enable or re-enable
        setPage(6)
    }

    const handleNotificationPermissionChange = (status) => {
        if (status === 'denied') {
            localStorage.setItem('notificationPermissionOverride', 'denied');
        } else {
            localStorage.removeItem('notificationPermissionOverride');
        }
        setBootStage('loading');
    };

    const handleSkipPhone = async (type) => {
        if (url_attr['phone']){
            setPage(3)
            handleLogin(type)
        } else {
            if (type === 'create'){
                setPage(1)
            }
            else if (type === 'recover'){
                setPage(2)
            }
        }
    }
      
    return (
        <div className="flex flex-col h-screen">
            {/* Force white toolbar/nav bar on this page */}
            <Header version='1' /> 
            <div className="flex flex-col items-center h-screen justify-between">
                <Loading spinner={false} page={page} />
                <div className='flex z-0 font-Chains text-9xl justify-center items-center m-24'>
                    <p className='backdrop-blur-sm w-36 h-36 mt-6 rounded-full' />
                    <h1 className='z-0 absolute font-Chains text-9xl text-white'>a</h1>
                </div>
                { page <= 6 &&
                <motion.div
                    className={`flex z-0 w-[96%] rounded-3xl overflow-hidden bg-white dark:bg-darkgrey shadow-bottom justify-center min-h-52 h-auto`}
                    initial={{ y: -300}}
                    animate={{y: 0 }}
                    drag="y"
                    dragConstraints={{ top: -15, bottom: 15 }}
                    dragElastic={0.2}
                    transition={{ type: 'spring', stiffness: 300, damping: 30, bounce: 0.5 }}
                >
                    { /* check online and handle recover or create new wallet */}
                    { (page === 0 && navigator.onLine) && 
                        <div className="flex flex-col justify-between mt-12 mb-3">
                            <h3 onClick={() => handleSkipPhone('create')} className={`font-bold dark:text-white text-center`}>Create a new digital wallet</h3>
                            <h3 onClick={() => handleSkipPhone('recover')} className={`font-bold dark:text-slate-400 text-sm text-center text-grey`}>recover wallet</h3>
                        </div>
                    }
                    { (page === 0 && !navigator.onLine) && 
                        <div className="flex flex-col items-center justify-between my-6">
                            <WifiIcon className='w-1/3 m-3'  />
                            <h3 className={`font-bold`}>No data service.</h3>
                            <h3 className={`text-sm text-center`}>Connect to recover or create a wallet.</h3>
                        </div>
                    }
                    { /* handle phone number and OTP code UI */}
                    { page === 1 && <InputButton onAdd={handleAddAttr} page={page} confirm='send verification code' handleRightClick={() => handleLogin('create')}/> }
                    { page === 2 && <InputButton onAdd={handleAddAttr} page={page} confirm='send verification code' handleRightClick={() => handleLogin('recover')}/> }
                    { /* handle select union, notifications and location sharing */}
                    { page === 3 && <InputButton onAdd={handleAddAttr} backpage={() => setPage(1)} page={page} confirm='verify your code' handleRightClick={() => handleVerifyOTP('create')}/> }
                    { page === 4 && <InputButton onAdd={handleAddAttr} backpage={() => setPage(1)} page={page} confirm='verify your code' handleRightClick={() => handleVerifyOTP('recover')}/>}
                    { /* handle set all data  */}
                    { page === 5 && <MemberUnion handleSetNotifications={handleGotoNotifications} address={_address} chain={url_attr?.chain} /> }
                    { page === 6 && <EnableNotifications autoResolve={false} onAdd={handleNotificationPermissionChange} address={_address} /> }
                </motion.div>
                }
                <div 
                    className='flex flex-row w-[96%] sticky rounded-t-3xl bg-white dark:bg-darkgrey shadow-top'>
                    { (page === 0 || page >= 3 && page <= 6 ) && <InformationCircleIcon className='text-gray-300 dark:text-slate-500 w-1/6 m-6' />}
                    { page === 0 && <p className='h-full w-3/4 my-6 mx-6 text-xs dark:text-slate-400 leading-normal'>The wallet will hold all your grants, certificates and equity. Do not share the keys with anyone.</p>}
                    { (page === 3 || page === 4) && <p className='h-full w-3/4 my-6 mx-6 text-xs dark:text-slate-400 leading-normal'>Look in your Messages app for a confirmation code.</p>}
                    { page === 5 && <p className='h-full w-3/4 my-6 mx-6 text-xs dark:text-slate-400 leading-normal'>Select a reputable Union in your area that offers financial services tailored to your needs as a farmer. Go to settings to switch Unions.</p>}
                    { page === 6 && <p className='h-full w-3/4 my-6 mx-6 text-xs dark:text-slate-400 leading-normal'>Your union will send you updates about new finance, farming, and trading opportunities, as well as updates like delayed payments, pending earnings and milestones we detected in your fields.</p>}
                </div>
            </div>
        </div>
        )
}
export default RegisterRecover
