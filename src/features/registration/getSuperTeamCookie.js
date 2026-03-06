
// load superteam cookie
export function getSuperteamCookie(name) {
    /*
        Params have to be EXACT
            { 0: Superteam address,
              1: chain,
              2: phone number,
              3: OTP,  (not in URL)
              4: language (not used in app)
              }
    */
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);

    if (parts.length === 2) {
        const result = parts[1].split(',').reduce((acc,v) => {
            const value = v.split('$')          
            acc[value[0]] = value[1]
            return acc
        },{})
        console.log('results', result)
        return result

    }
    return [];
  }