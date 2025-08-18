import {
  generateId,
  formatNumber,
  formatCurrency,
  formatPercentage,
  formatBytes,
  debounce,
  throttle,
  deepClone,
  isEmpty,
  get,
  set,
  chunk,
  unique,
  groupBy,
  hexToRgb,
  rgbToHex,
  getContrastColor,
} from '../helpers';

describe('Utility Functions', () => {
  describe('generateId', () => {
    it('generates a unique string', () => {
      const id1 = generateId();
      const id2 = generateId();
      
      expect(typeof id1).toBe('string');
      expect(typeof id2).toBe('string');
      expect(id1).not.toBe(id2);
      expect(id1.length).toBeGreaterThan(0);
    });
  });

  describe('formatNumber', () => {
    it('formats numbers with abbreviations', () => {
      expect(formatNumber(0)).toBe('0');
      expect(formatNumber(500)).toBe('500');
      expect(formatNumber(1000)).toBe('1K');
      expect(formatNumber(1500)).toBe('1.5K');
      expect(formatNumber(1000000)).toBe('1M');
      expect(formatNumber(1500000)).toBe('1.5M');
      expect(formatNumber(1000000000)).toBe('1B');
    });

    it('respects decimal places', () => {
      expect(formatNumber(1234, 0)).toBe('1K');
      expect(formatNumber(1234, 2)).toBe('1.23K');
    });
  });

  describe('formatCurrency', () => {
    it('formats currency values', () => {
      const result = formatCurrency(1234.56);
      expect(result).toMatch(/\$1,234\.56/);
    });

    it('supports different currencies', () => {
      const result = formatCurrency(1234.56, 'EUR');
      expect(result).toContain('€');
    });
  });

  describe('formatPercentage', () => {
    it('formats percentage values', () => {
      expect(formatPercentage(50)).toBe('50.0%');
      expect(formatPercentage(25.5)).toBe('25.5%');
      expect(formatPercentage(100)).toBe('100.0%');
    });

    it('respects decimal places', () => {
      expect(formatPercentage(33.333, 2)).toBe('33.33%');
    });
  });

  describe('formatBytes', () => {
    it('formats byte values', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(1073741824)).toBe('1 GB');
    });

    it('respects decimal places', () => {
      expect(formatBytes(1536, 1)).toBe('1.5 KB');
    });
  });

  describe('debounce', () => {
    jest.useFakeTimers();

    it('delays function execution', () => {
      const mockFn = jest.fn();
      const debouncedFn = debounce(mockFn, 100);

      debouncedFn();
      expect(mockFn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(100);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('cancels previous calls', () => {
      const mockFn = jest.fn();
      const debouncedFn = debounce(mockFn, 100);

      debouncedFn();
      debouncedFn();
      debouncedFn();

      jest.advanceTimersByTime(100);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    afterEach(() => {
      jest.clearAllTimers();
    });
  });

  describe('throttle', () => {
    jest.useFakeTimers();

    it('limits function execution rate', () => {
      const mockFn = jest.fn();
      const throttledFn = throttle(mockFn, 100);

      throttledFn();
      throttledFn();
      throttledFn();

      expect(mockFn).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(100);
      throttledFn();
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    afterEach(() => {
      jest.clearAllTimers();
    });
  });

  describe('deepClone', () => {
    it('creates a deep copy of objects', () => {
      const original = {
        a: 1,
        b: {
          c: 2,
          d: [3, 4, 5]
        }
      };

      const cloned = deepClone(original);
      
      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.b).not.toBe(original.b);
      expect(cloned.b.d).not.toBe(original.b.d);
    });

    it('handles primitive values', () => {
      expect(deepClone(42)).toBe(42);
      expect(deepClone('hello')).toBe('hello');
      expect(deepClone(null)).toBe(null);
      expect(deepClone(undefined)).toBe(undefined);
    });

    it('handles dates', () => {
      const date = new Date();
      const cloned = deepClone(date);
      
      expect(cloned).toEqual(date);
      expect(cloned).not.toBe(date);
    });
  });

  describe('isEmpty', () => {
    it('correctly identifies empty values', () => {
      expect(isEmpty(null)).toBe(true);
      expect(isEmpty(undefined)).toBe(true);
      expect(isEmpty({})).toBe(true);
      expect(isEmpty([])).toBe(true);
      expect(isEmpty('')).toBe(true);
    });

    it('correctly identifies non-empty values', () => {
      expect(isEmpty({ a: 1 })).toBe(false);
      expect(isEmpty([1])).toBe(false);
      expect(isEmpty('hello')).toBe(false);
      expect(isEmpty(0)).toBe(false);
      expect(isEmpty(false)).toBe(false);
    });
  });

  describe('get', () => {
    const obj = {
      a: {
        b: {
          c: 'value'
        }
      }
    };

    it('gets nested values', () => {
      expect(get(obj, 'a.b.c')).toBe('value');
      expect(get(obj, 'a.b')).toEqual({ c: 'value' });
    });

    it('returns default value for missing paths', () => {
      expect(get(obj, 'a.b.d', 'default')).toBe('default');
      expect(get(obj, 'x.y.z', 'default')).toBe('default');
    });

    it('handles null/undefined objects', () => {
      expect(get(null, 'a.b.c', 'default')).toBe('default');
      expect(get(undefined, 'a.b.c', 'default')).toBe('default');
    });
  });

  describe('set', () => {
    it('sets nested values', () => {
      const obj = {};
      set(obj, 'a.b.c', 'value');
      
      expect(obj).toEqual({
        a: {
          b: {
            c: 'value'
          }
        }
      });
    });

    it('overwrites existing values', () => {
      const obj = { a: { b: 'old' } };
      set(obj, 'a.b', 'new');
      
      expect(obj.a.b).toBe('new');
    });
  });

  describe('chunk', () => {
    it('splits array into chunks', () => {
      const array = [1, 2, 3, 4, 5, 6, 7];
      const chunks = chunk(array, 3);
      
      expect(chunks).toEqual([
        [1, 2, 3],
        [4, 5, 6],
        [7]
      ]);
    });

    it('handles empty arrays', () => {
      expect(chunk([], 3)).toEqual([]);
    });
  });

  describe('unique', () => {
    it('removes duplicate values', () => {
      const array = [1, 2, 2, 3, 3, 3, 4];
      expect(unique(array)).toEqual([1, 2, 3, 4]);
    });

    it('handles strings', () => {
      const array = ['a', 'b', 'b', 'c'];
      expect(unique(array)).toEqual(['a', 'b', 'c']);
    });
  });

  describe('groupBy', () => {
    it('groups objects by key', () => {
      const array = [
        { type: 'fruit', name: 'apple' },
        { type: 'fruit', name: 'banana' },
        { type: 'vegetable', name: 'carrot' }
      ];

      const grouped = groupBy(array, 'type');
      
      expect(grouped).toEqual({
        fruit: [
          { type: 'fruit', name: 'apple' },
          { type: 'fruit', name: 'banana' }
        ],
        vegetable: [
          { type: 'vegetable', name: 'carrot' }
        ]
      });
    });
  });

  describe('Color utilities', () => {
    describe('hexToRgb', () => {
      it('converts hex to RGB', () => {
        expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
        expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
        expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
      });

      it('handles invalid hex', () => {
        expect(hexToRgb('invalid')).toBeNull();
      });
    });

    describe('rgbToHex', () => {
      it('converts RGB to hex', () => {
        expect(rgbToHex(255, 255, 255)).toBe('#ffffff');
        expect(rgbToHex(0, 0, 0)).toBe('#000000');
        expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
      });
    });

    describe('getContrastColor', () => {
      it('returns appropriate contrast color', () => {
        expect(getContrastColor('#ffffff')).toBe('#000000');
        expect(getContrastColor('#000000')).toBe('#ffffff');
      });

      it('handles invalid colors', () => {
        expect(getContrastColor('invalid')).toBe('#000000');
      });
    });
  });
});