import { describe, expect, it } from 'vitest';
import { parseCartItems, serializeCartItems } from './cart';

describe('parseCartItems', () => {
  it('parses a valid multi-item cart', () => {
    const params = new URLSearchParams({ items: 'aaa:2,bbb:1' });
    expect(parseCartItems(params)).toEqual([
      { ticketTypeId: 'aaa', quantity: 2 },
      { ticketTypeId: 'bbb', quantity: 1 },
    ]);
  });

  it('returns an empty array when items is absent', () => {
    expect(parseCartItems(new URLSearchParams())).toEqual([]);
  });

  it('returns an empty array when items is an empty string', () => {
    expect(parseCartItems(new URLSearchParams({ items: '' }))).toEqual([]);
  });

  it('drops entries with a non-integer quantity', () => {
    const params = new URLSearchParams({ items: 'aaa:1.5,bbb:2' });
    expect(parseCartItems(params)).toEqual([{ ticketTypeId: 'bbb', quantity: 2 }]);
  });

  it('drops entries with a zero or negative quantity', () => {
    const params = new URLSearchParams({ items: 'aaa:0,bbb:-3,ccc:5' });
    expect(parseCartItems(params)).toEqual([{ ticketTypeId: 'ccc', quantity: 5 }]);
  });

  it('drops entries missing the ":" separator', () => {
    const params = new URLSearchParams({ items: 'aaa,bbb:2' });
    expect(parseCartItems(params)).toEqual([{ ticketTypeId: 'bbb', quantity: 2 }]);
  });

  it('drops entries with an empty ticketTypeId', () => {
    const params = new URLSearchParams({ items: ':3,bbb:2' });
    expect(parseCartItems(params)).toEqual([{ ticketTypeId: 'bbb', quantity: 2 }]);
  });

  it('keeps the last occurrence of a duplicated ticketTypeId', () => {
    const params = new URLSearchParams({ items: 'aaa:1,aaa:4' });
    expect(parseCartItems(params)).toEqual([{ ticketTypeId: 'aaa', quantity: 4 }]);
  });
});

describe('serializeCartItems', () => {
  it('serializes a multi-item cart', () => {
    expect(
      serializeCartItems([
        { ticketTypeId: 'aaa', quantity: 2 },
        { ticketTypeId: 'bbb', quantity: 1 },
      ]),
    ).toBe('aaa:2,bbb:1');
  });

  it('filters out zero-quantity items', () => {
    expect(
      serializeCartItems([
        { ticketTypeId: 'aaa', quantity: 0 },
        { ticketTypeId: 'bbb', quantity: 3 },
      ]),
    ).toBe('bbb:3');
  });

  it('serializes an empty cart to an empty string', () => {
    expect(serializeCartItems([])).toBe('');
  });

  it('round-trips through parseCartItems', () => {
    const items = [
      { ticketTypeId: 'aaa', quantity: 2 },
      { ticketTypeId: 'bbb', quantity: 1 },
    ];
    const params = new URLSearchParams({ items: serializeCartItems(items) });
    expect(parseCartItems(params)).toEqual(items);
  });
});
