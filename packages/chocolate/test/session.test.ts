import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CancellationSource, Session } from '../src/index.js';
import { FakeTransport } from '../src/testing.js';

describe('transport lifecycle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not send pre-cancelled operations', async () => {
    const transport = new FakeTransport();
    const session = new Session(transport);
    const cancellation = new CancellationSource();
    cancellation.cancel();
    await expect(session.send([1], { signal: cancellation.signal })).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(transport.sent).toEqual([]);
    session.dispose();
  });

  it('copies send input and keeps the physical send busy after cancellation until late completion', async () => {
    const transport = new FakeTransport({ autoComplete: false });
    const session = new Session(transport);
    const cancellation = new CancellationSource();
    const input = new Uint8Array([0, 255]);
    const operation = session.send(input, { signal: cancellation.signal });
    input.fill(7);
    const rejected = expect(operation).rejects.toMatchObject({ code: 'CANCELLED' });
    cancellation.cancel();
    await rejected;
    expect([...transport.sent[0]!.toUint8Array()]).toEqual([0, 255]);
    await expect(session.send([2])).rejects.toMatchObject({ code: 'BUSY' });
    transport.completeSend(0);
    await Promise.resolve();
    const next = session.send([3]);
    transport.completeSend(1);
    expect((await next).bytes.toUint8Array()).toEqual(new Uint8Array([3]));
    session.dispose();
  });

  it('times out exactly at deadline, ignores late data, and removes the old receiver', async () => {
    const transport = new FakeTransport();
    const session = new Session(transport);
    const matches = vi.fn(() => true);
    const operation = session.receive(matches, { timeoutMs: 20 });
    const rejected = expect(operation).rejects.toMatchObject({ code: 'TIMEOUT', data: { timeoutMs: 20 } });
    await vi.advanceTimersByTimeAsync(19);
    expect(matches).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    transport.emitIncoming([9], 1);
    expect(matches).not.toHaveBeenCalled();
    const next = session.receive((frame) => frame.bytes.at(0) === 8);
    transport.emitIncoming([7], 2);
    transport.emitIncoming([8], 3);
    expect((await next).timestamp).toBe(3);
    session.dispose();
  });

  it('disconnect rejects active send and receive, remains terminal, and ignores late send failures', async () => {
    const transport = new FakeTransport({ autoComplete: false });
    const session = new Session(transport);
    const sending = session.send([1]);
    const receiving = session.receive(() => true);
    const sent = expect(sending).rejects.toMatchObject({ code: 'DISCONNECTED' });
    const read = expect(receiving).rejects.toMatchObject({ code: 'DISCONNECTED' });
    transport.disconnect();
    await Promise.all([sent, read]);
    transport.failSend(0, new Error('late failure'));
    await Promise.resolve();
    await expect(session.send([2])).rejects.toMatchObject({ code: 'DISCONNECTED' });
    session.dispose();
  });

  it('cancellation removes a receive waiter; dispose rejects a new waiter and prevents reuse', async () => {
    const transport = new FakeTransport();
    const session = new Session(transport);
    const cancellation = new CancellationSource();
    const operation = session.receive(() => true, { signal: cancellation.signal });
    const rejected = expect(operation).rejects.toMatchObject({ code: 'CANCELLED' });
    cancellation.cancel();
    await rejected;
    const next = session.receive(() => true);
    const closed = expect(next).rejects.toMatchObject({ code: 'SESSION_CLOSED' });
    session.dispose();
    await closed;
    await expect(session.receive(() => true)).rejects.toMatchObject({ code: 'SESSION_CLOSED' });
  });

  it('reports structured transport and matcher failures without localized strings', async () => {
    const transport = new FakeTransport({ autoComplete: false });
    const session = new Session(transport);
    const cause = { nativeCode: 42 };
    const operation = session.send([1]);
    const failed = expect(operation).rejects.toMatchObject({ code: 'TRANSPORT_FAILURE', data: { cause } });
    transport.failSend(0, cause);
    await failed;
    const matching = session.receive(() => { throw cause; });
    const badMatcher = expect(matching).rejects.toMatchObject({ code: 'MATCHER_FAILURE', data: { cause } });
    transport.emitIncoming([1]);
    await badMatcher;
    session.dispose();
  });
});
