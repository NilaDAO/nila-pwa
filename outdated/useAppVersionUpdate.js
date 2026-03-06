// hooks/useAppVersion.ts
import { useEffect } from "react";
import { readItem,createItem, updateItem,deleteAllItems } from "../src/utils/db";
xw
const useAppVersion = () => {

  useEffect(() => {
    const checkVersion = async () => {
      try {
        const APP_VERSION = await readItem("app_version", "Init");
        const res = await fetch("/meta.v2006.json", { cache: "no-store" });
        const { version, forceLogoutOnVersionChange } = await res.json();

        if (!APP_VERSION || version !== APP_VERSION.value) {
          if (forceLogoutOnVersionChange) {   
            deleteAllItems()
            // remove all cookies
            document.cookie.split(';').forEach(function(cookie) {
                const name = cookie.split('=')[0].trim();
                document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/';
              });              
          }
          // Hard reload without cache     
          //window.location.reload(true);
          // set app_version in db
          if (!APP_VERSION) {          
            await createItem({ id: 'app_version', value: version },'Init'); // phone
          } else {
            await updateItem({ id: 'app_version', value: version },'Init'); // phone
          }
          
        }
      } catch (err) {
        console.error("Failed to check app version", err);
      }
    };

    checkVersion();
  }, []);
};

export default useAppVersion;