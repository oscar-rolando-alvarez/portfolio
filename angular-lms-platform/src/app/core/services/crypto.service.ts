import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class CryptoService {
  
  generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  hash(input: string): string {
    let hash = 0;
    if (input.length === 0) return hash.toString();
    
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(16);
  }

  generateRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  encryptSimple(text: string, key: string): string {
    let encrypted = '';
    for (let i = 0; i < text.length; i++) {
      const keyChar = key.charCodeAt(i % key.length);
      const textChar = text.charCodeAt(i);
      encrypted += String.fromCharCode(textChar ^ keyChar);
    }
    return btoa(encrypted);
  }

  decryptSimple(encryptedText: string, key: string): string {
    const encrypted = atob(encryptedText);
    let decrypted = '';
    for (let i = 0; i < encrypted.length; i++) {
      const keyChar = key.charCodeAt(i % key.length);
      const encryptedChar = encrypted.charCodeAt(i);
      decrypted += String.fromCharCode(encryptedChar ^ keyChar);
    }
    return decrypted;
  }
}