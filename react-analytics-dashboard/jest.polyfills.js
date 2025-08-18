// Polyfill "global" in jest environment
import { TextEncoder, TextDecoder } from 'util';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Polyfill for crypto.randomUUID
if (!global.crypto) {
  global.crypto = {};
}

if (!global.crypto.randomUUID) {
  global.crypto.randomUUID = function randomUUID() {
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
  };
}

// Polyfill for crypto.getRandomValues
if (!global.crypto.getRandomValues) {
  global.crypto.getRandomValues = function getRandomValues(array) {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    return array;
  };
}