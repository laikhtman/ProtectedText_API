import crypto from 'node:crypto';

const KEY_LENGTH = 64;

function scryptAsync(secret, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(secret, salt, KEY_LENGTH, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}

export async function hashAuthToken(authToken) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await scryptAsync(authToken, salt);
  return {
    salt,
    hash: Buffer.from(derivedKey).toString('hex')
  };
}

export async function verifyAuthToken(authToken, auth) {
  if (!auth?.salt || !auth?.hash) {
    return false;
  }

  const candidate = await scryptAsync(authToken, auth.salt);
  const stored = Buffer.from(auth.hash, 'hex');

  if (candidate.length !== stored.length) {
    return false;
  }

  return crypto.timingSafeEqual(candidate, stored);
}

