import React, { useState, useEffect } from 'react';

async function checkBiometricSupport() {
    if (window.PublicKeyCredential) {
      try {
        const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        return available;
      } catch (error) {
        console.error('Error checking biometric support:', error);
        return false;
      }
    }
    return false;
  }
  function BiometricAuth() {
    const [biometricSupport, setBiometricSupport] = useState(false);
    const [status, setStatus] = useState('');
  
    useEffect(() => {
      async function checkSupport() {
        const support = await checkBiometricSupport();
        setBiometricSupport(support);
        setStatus(support ? 'Biometric authentication is supported.' : 'Biometric authentication is not supported on this device.');
      }
      checkSupport();
    }, []);
  
    async function authenticateWithBiometric() {
      try {
        setStatus('Waiting for biometric authentication...');
        const publicKeyCredentialRequestOptions = {
          challenge: new Uint8Array(32),
          rpId: window.location.hostname,
          userVerification: "required",
          timeout: 60000,
        };
  
        const assertion = await navigator.credentials.get({
          publicKey: publicKeyCredentialRequestOptions
        });
  
        setStatus('Authentication successful!');
        console.log('User authenticated:', assertion);
        // Verify the assertion on your server
      } catch (error) {
        setStatus(`Authentication failed: ${error.message}`);
        console.error('Error authenticating with biometric:', error);
      }
    }
  
    return (
      <div>
        <button onClick={authenticateWithBiometric} disabled={!biometricSupport}>
          Authenticate with Biometric
        </button>
        <p>{status}</p>
      </div>
    );
  }
  
  export default BiometricAuth;
  