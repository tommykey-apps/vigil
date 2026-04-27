import { createHash, randomBytes } from 'node:crypto';

const b64url = (b: Buffer) => b.toString('base64url');

export const newOpaqueId = () => b64url(randomBytes(32));
export const newState = () => b64url(randomBytes(32));
export const newVerifier = () => b64url(randomBytes(32));

export const challengeFor = (verifier: string) =>
	b64url(createHash('sha256').update(verifier).digest());
