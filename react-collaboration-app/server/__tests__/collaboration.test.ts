import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { createCollaborationServer, type CollaborationServer } from '../app.ts';

let server: CollaborationServer;
let baseUrl: string;
const clients: Socket[] = [];

function client(): Socket {
  const socket = connect(baseUrl, { transports: ['websocket'], forceNew: true });
  clients.push(socket);
  return socket;
}

function once<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve));
}

beforeAll(async () => {
  server = createCollaborationServer({ corsOrigins: ['http://localhost'] });
  await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
  const { port } = server.httpServer.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  clients.forEach((socket) => socket.disconnect());
  await new Promise<void>((resolve) => server.io.close(() => resolve()));
});

describe('collaboration server', () => {
  it('exposes a health endpoint', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok', workspaces: 1 });
  });

  it('sends workspace state on join and broadcasts operations to peers', async () => {
    const alice = client();
    const bob = client();

    const aliceState = once<{ workspace: { id: string } }>(alice, 'workspace:state');
    alice.emit('user:join', { name: 'Alice' });
    expect((await aliceState).workspace.id).toBe('default');

    const bobJoined = once<{ name: string }>(alice, 'user:joined');
    const bobState = once(bob, 'workspace:state');
    bob.emit('user:join', { name: 'Bob' });
    await bobState;
    expect((await bobJoined).name).toBe('Bob');

    const received = once<{ objectId: string; userId: string; type: string }>(bob, 'canvas:operation');
    alice.emit('canvas:operation', {
      id: 'op-1',
      type: 'add',
      objectId: 'rect-1',
      data: { type: 'Rect', left: 10, top: 20, width: 30, height: 40 },
      userId: 'spoofed',
      timestamp: 0,
      version: 1,
    });

    const operation = await received;
    expect(operation.objectId).toBe('rect-1');
    expect(operation.type).toBe('add');
    // The server stamps the authenticated socket identity, not the client-provided one.
    expect(operation.userId).toBe(alice.id);

    const sync = once<{ objects: { id: string }[] }>(bob, 'canvas:state');
    bob.emit('canvas:sync');
    expect((await sync).objects.map((o) => o.id)).toContain('rect-1');
  });

  it('ignores malformed operations', async () => {
    const carol = client();
    const state = once(carol, 'workspace:state');
    carol.emit('user:join', { name: 'Carol' });
    await state;

    carol.emit('canvas:operation', { type: 'explode' });
    const sync = once<{ objects: unknown[]; version: number }>(carol, 'canvas:state');
    carol.emit('canvas:sync');
    const { objects } = await sync;
    expect(objects).toHaveLength(1);
  });
});
