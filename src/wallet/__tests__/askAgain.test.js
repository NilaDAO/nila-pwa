import { askAgain, NO_ANSWER } from '../askAgain';

const never = () => new Promise(() => {});

describe('askAgain (a wallet request with no answer, 16 Nov)', () => {
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  test('the first answer, asked once', async () => {
    const ask = jest.fn(() => Promise.resolve('sig'));
    await expect(askAgain(ask, { waitMs: 20 })).resolves.toBe('sig');
    expect(ask).toHaveBeenCalledTimes(1);
  });

  test('a request with no answer is asked again', async () => {
    const ask = jest.fn().mockImplementationOnce(never).mockImplementation(() => Promise.resolve('sig'));
    await expect(askAgain(ask, { waitMs: 20 })).resolves.toBe('sig');
    expect(ask).toHaveBeenCalledTimes(2);
  });

  test('never an answer: an error after the last ask, not a wait for ever', async () => {
    const ask = jest.fn(never);
    await expect(askAgain(ask, { waitMs: 10, asks: 3 })).rejects.toThrow(NO_ANSWER);
    expect(ask).toHaveBeenCalledTimes(3);
  });

  test('an error passes through at once', async () => {
    const ask = jest.fn(() => Promise.reject(new Error('wallet proxy not initialized')));
    await expect(askAgain(ask, { waitMs: 20 })).rejects.toThrow('wallet proxy not initialized');
    expect(ask).toHaveBeenCalledTimes(1);
  });
});
