/**
 * TARX Autonomic Daemon - Patch Signer
 *
 * Ed25519 cryptographic signing for patches:
 * - Generates/loads node keypair on init
 * - Signs fix packages for mesh broadcast
 * - Verifies signatures from other nodes
 * - Node ID derived from public key fingerprint
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export class PatchSigner {
  private privateKey: crypto.KeyObject | null = null;
  private publicKey: crypto.KeyObject | null = null;
  private nodeId: string = '';
  private readonly KEY_DIR: string;

  constructor() {
    this.KEY_DIR = path.join(process.env.HOME || '~', '.tarx', 'keys');
  }

  async initialize(): Promise<string> {
    if (!fs.existsSync(this.KEY_DIR)) {
      fs.mkdirSync(this.KEY_DIR, { recursive: true });
    }

    const privateKeyPath = path.join(this.KEY_DIR, 'autonomic.key');
    const publicKeyPath = path.join(this.KEY_DIR, 'autonomic.pub');

    if (fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath)) {
      // Load existing keys
      this.privateKey = crypto.createPrivateKey(fs.readFileSync(privateKeyPath));
      this.publicKey = crypto.createPublicKey(fs.readFileSync(publicKeyPath));
      console.log('[PatchSigner] Loaded existing keypair');
    } else {
      // Generate new Ed25519 keypair
      const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
      this.privateKey = privateKey;
      this.publicKey = publicKey;

      // Save keys
      fs.writeFileSync(
        privateKeyPath,
        privateKey.export({ type: 'pkcs8', format: 'pem' })
      );
      fs.writeFileSync(
        publicKeyPath,
        publicKey.export({ type: 'spki', format: 'pem' })
      );

      // Secure the private key
      fs.chmodSync(privateKeyPath, 0o600);

      console.log('[PatchSigner] Generated new Ed25519 keypair');
    }

    // Generate node ID from public key fingerprint
    const pubKeyDer = this.publicKey.export({ type: 'spki', format: 'der' });
    this.nodeId = crypto.createHash('sha256').update(pubKeyDer).digest('hex').substring(0, 16);

    console.log(`[PatchSigner] Node ID: ${this.nodeId}`);
    return this.nodeId;
  }

  sign(data: string): string {
    if (!this.privateKey) {
      throw new Error('PatchSigner not initialized');
    }
    const signature = crypto.sign(null, Buffer.from(data), this.privateKey);
    return signature.toString('base64');
  }

  verify(data: string, signature: string, publicKeyPem: string): boolean {
    try {
      const publicKey = crypto.createPublicKey(publicKeyPem);
      return crypto.verify(
        null,
        Buffer.from(data),
        publicKey,
        Buffer.from(signature, 'base64')
      );
    } catch (error) {
      console.error('[PatchSigner] Verification failed:', error);
      return false;
    }
  }

  getPublicKeyPem(): string {
    if (!this.publicKey) {
      throw new Error('PatchSigner not initialized');
    }
    return this.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  }

  getNodeId(): string {
    return this.nodeId;
  }
}
