import { SignUpCommand, ConfirmSignUpCommand,UpdateUserAttributesCommand,RespondToAuthChallengeCommand,GetUserCommand,ForgotPasswordCommand,ConfirmForgotPasswordCommand,InitiateAuthCommand,AdminUpdateUserAttributesCommand } from '@aws-sdk/client-cognito-identity-provider';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';

const ClientId = process.env.REACT_APP_COGNITO_CLIENTID

// Initialize AWS Cognito
const client = new CognitoIdentityProviderClient({ 
    region: 'ap-south-1',
    credentials: {
        accessKeyId: process.env.REACT_APP_NILAAPP_AWS,
        secretAccessKey: process.env.REACT_APP_NILAAPP_SECRET  
      }    
  });

export const signUp = async (phoneNumber,chainId) => {
    const signup = new SignUpCommand({
        ClientId: ClientId,
        Username: phoneNumber,
        Password: 'dummyPassword', // Temporary password; OTP will be sent to phone
        UserAttributes: [
            { Name: 'phone_number', Value: phoneNumber },
            { Name: 'custom:chain', Value: chainId },
        ]
      });
    return await client.send(signup);
}

export const confirmSignUp = async (phoneNumber, otpCode) => {
    const command = new ConfirmSignUpCommand({
        ClientId: ClientId,
        Username: phoneNumber,
        ConfirmationCode: otpCode,
      });
    return await client.send(command);
}

export const updateCognitoAttributes = async (phoneNumber, salt) => {
    const updateAttr = new UpdateUserAttributesCommand({
        UserPoolId: process.env.REACT_APP_USERPOOL_ID,
        Username: phoneNumber,
        UserAttributes: [
            {
            Name: "custom:salt_",
            Value: salt
            },
    ]
    })
    return await client.send(updateAttr);
}

export const updateUserChain = async ({ accessToken, refreshToken, chainId, phoneNumber }) => {
    // Try AccessToken path first; if expired and refreshToken exists, refresh and retry.
    const runUpdate = async (token) => {
        const updateAttr = new UpdateUserAttributesCommand({
            AccessToken: token,
            UserAttributes: [
                {
                Name: "custom:chain",
                Value: chainId
                },
            ]
        });
        return client.send(updateAttr);
    };

    try {
        return await runUpdate(accessToken);
    } catch (err) {
        const code = err?.name || err?.__type || err?.code;
        // If token is expired/invalid and we have a refresh token, refresh and retry once.
        if (refreshToken && (code === "NotAuthorizedException" || code === "InvalidParameterException")) {
            const refreshed = await refreshSession(refreshToken);
            const newAccess = refreshed?.AccessToken || refreshed?.AuthenticationResult?.AccessToken;
            if (!newAccess) throw err;
            return await runUpdate(newAccess);
        }
        // Fallback: if we have AWS creds + phone, use admin update (no tokens needed)
        if (phoneNumber && process.env.REACT_APP_USERPOOL_ID) {
            const adminCmd = new AdminUpdateUserAttributesCommand({
                UserPoolId: process.env.REACT_APP_USERPOOL_ID,
                Username: phoneNumber,
                UserAttributes: [
                    { Name: "custom:chain", Value: chainId }
                ]
            });
            return client.send(adminCmd);
        }
        throw err;
    }
}

export const getUserAttributes = async (accesstoken) => {
    // ON THE FLY VERIFICATION (SESSION OR REFRESH)
    const command = new GetUserCommand({
        AccessToken: accesstoken
    });
    return await client.send(command);
}

export const triggerRecoveryOTP = async (phoneNumber) => {
    const command = new ForgotPasswordCommand({
        ClientId: ClientId,
        Username: phoneNumber,

    })
    return await client.send(command);
  };
  
export const confirmRecovery = async (phoneNumber, otpCode) => {
    const command = new ConfirmForgotPasswordCommand({
        ClientId: ClientId,
        UserPoolId: process.env.REACT_APP_USERPOOL_ID,
        Username: phoneNumber,
        Password: 'dummyPassword', // Temporary password; OTP will be sent to phone
        ConfirmationCode: otpCode,
    })
    return await client.send(command)
}

  // look for active session,new registration or new session
export const initAuth = async (phoneNumber) => {
    console.log('set session', phoneNumber)
    try {
      const command = new InitiateAuthCommand({
        AuthFlow: 'CUSTOM_AUTH',
        ClientId: ClientId,
        AuthParameters: {
            USERNAME: phoneNumber,
          },        
      });

      return await client.send(command)
    } catch (err) {
        console.log('err', err);
    }
  }

  export const respondToAuthChallenge = async (phoneNumber, otpCode, session,salt) => {
    try {
      const command = new RespondToAuthChallengeCommand({
        ClientId: ClientId,
        ChallengeName: 'CUSTOM_CHALLENGE',
        Session: session, // Session from the initiateAuth response
        ChallengeResponses: {
          USERNAME: phoneNumber,
          ANSWER: otpCode, // The OTP code entered by the user
        },
        ClientMetadata: {
          salt: salt,
        },
      });
      return await client.send(command);
    } catch (err) {
      console.error('Error responding to auth challenge:', err);
      throw err;
    }
  };

  export const refreshSession = async (refreshToken) => {
    const params = {
      AuthFlow: "REFRESH_TOKEN_AUTH", // Refresh token flow
      ClientId: ClientId, // Your Cognito App Client ID
      AuthParameters: {
        REFRESH_TOKEN: refreshToken, // The refresh token
      },
    };
  
    try {
      const command = new InitiateAuthCommand(params);
      const response = await client.send(command);
      return response.AuthenticationResult; // Contains new Access and Id tokens
    } catch (err) {
      console.error("Failed to refresh token:", err);
      throw err;
    }
  };
