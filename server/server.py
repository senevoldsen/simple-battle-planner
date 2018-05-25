import asyncio
import json
import socket
import sys
import websockets
import datetime

from config import log
from room import Room
import persist

'''
    - Need room cleaning
    - Room/Client meta handling
    - Handle persistence better instead of on each delta
'''


class BPException(Exception):
    def __init__(self, message):
        super(BPException, self).__init__(message)


class KeepAliveFailed(BPException):
    def __ini__(self, message):
        super(KeepAliveFailed, self).__init__(message)


class Client(object):
    """A Client"""
    def __init__(self, cid, socket):
        super(Client, self).__init__()
        self.cid = cid
        self.socket = socket
        self.name = 'Unknown'
        self.room = None
        self.outgoing_messages = asyncio.Queue()
        self.bytes_sent = 0
        self.bytes_received = 0

    def queue_message(self, message):
        self.outgoing_messages.put_nowait(message)

    async def message_handler(self):
        while True:
            message = await self.outgoing_messages.get()
            message_json = json.dumps(message)
            self.bytes_sent += len(message_json)
            log.trace("Sending to cid '%d' message '%s'", self.cid, message_json)
            await self.socket.send(message_json)
            self.outgoing_messages.task_done()


class Server(object):
    """Used for general interaction from submodules"""
    def __init__(self):
        super(Server, self).__init__()
        self._next_cid = 1
        self.db = None
        self.rooms = {}
        self.clients = {}
        self.message_handlers = {}
        # Open storage before creating room
        self._open()
        self.default_room = self.rooms['default'] = self.create_room('default', persistent=True)

    def _open(self):
        if self.db:
            self.close()
        self.db = persist.SqliteKeyStore('serverdata.db')
        self.db.open()

    def close(self):
        if self.db:
            self.db.close()
        self.db = None

    def create_room(self, name, *args, **kwargs):
        new_room = Room(name, self, *args, **kwargs)
        new_room.try_load_state()
        return new_room

    def get_room(self, name):
        return self.rooms.get(name, None)

    # Currently overwrites e.g. not adding
    def add_handler(self, msg_type, func):
        self.message_handlers[msg_type] = func

    def room_request_store(self, room, data):
        if self.db is not None:
            self.db.store(room.name, data)

    def room_request_load(self, room):
        if self.db is not None:
            return self.db.load(room.name)
        else:
            return None

    def setup_client(self, websocket):
        cid, self._next_cid = self._next_cid, self._next_cid + 1
        client = Client(cid, websocket)
        self.clients[cid] = client
        client.name = 'Unknown #%d' % client.cid
        client.room = self.default_room
        client.room.member_join(client)
        return client

    def remove_client(self, client):
        if client.room is not None:
            client.room.member_leave(client)
        del self.clients[client.cid]

    def handle_message(self, client, msg_type, data):
        handler = self.message_handlers.get(msg_type, None)
        if handler is None:
            return False
        handler(client, data)
        return True

    # allowed_age is a duration/timedelta
    # This should be called regularly by an async timer.
    def remove_empty_old_rooms(self, allowed_age):
        now = datetime.datetime.now()
        old_rooms = (
            r for r in self.rooms
            if not r.persistent and r.went_empty_time is not None and (now - r.went_empty_time) > allowed_age
        )
        for room in old_rooms:
            log.info('Meant to delete room \'%s\' now, but resetting timer instead', room.name)
            room.went_empty_time = now


main_server = Server()


def message_handler(server, msg_type):
    def add_handler(func):
        server.add_handler(msg_type, func)
    return add_handler


@message_handler(main_server, 'room-join')
def on_room_join(client, data):
    room_name = data['room-name']
    new_room = main_server.get_room(room_name)
    if new_room is None:
        reply = {
            'type': 'room-join-failed',
            'room-name': room_name,
            'reason': 'Room does not exist'
        }
        client.queue_message(reply)
    else:
        # Update client data
        if nickname:
            client.name = data.get('username', client.name)
        if client.room is not None:
            client.room.member_leave(client)
        new_room.member_join(client)
        client.room = new_room


@message_handler(main_server, 'room-client-setname')
def on_room_client_setname(client, data):
    new_name = data['username']
    message = {
        'type': 'room-client-setname',
        'client-id': client.cid,
        'client-name': new_name
    }
    if client.room:
        client.room.broadcast_message(message)


@message_handler(main_server, 'room-create')
def on_text_message(client, data):
    text = data['text']
    if client.room:
        client.room.message_send_text(client, text)


@message_handler(main_server, 'state')
def on_state(client, data):
    room = client.room
    if room:
        room.force_set_state(data['state'], exclude=client)
    else:
        log.warning('No room to forward state to')


@message_handler(main_server, 'key-set')
def key_set(client, data):
    if client.room:
        client.room.set_key(client, data['key'], data['value'])


@message_handler(main_server, 'key-delete')
def key_delete(client, data):
    if client.room:
        client.room.delete_key(client, data['key'])


async def consumer_handler(client):
    while True:
        try:
            message = await asyncio.wait_for(client.socket.recv(), timeout=20)
        except asyncio.TimeoutError:
            try:
                pong_waiter = await client.socket.ping()
                await asyncio.wait_for(pong_waiter, timeout=10)
            except asyncio.TimeoutError:
                raise KeepAliveFailed('Connection to client lost')
        else:
            client.bytes_received += len(message)
            await handle_message(client, message)


async def handle_message(client, message):
    log.trace("handling message from cid '%d': %s", client.cid, message)
    try:
        error = False
        data = json.loads(message)
        msg_type = data['type']
        handled = main_server.handle_message(client, msg_type, data)
        error = not handled
    except (json.decoder.JSONDecodeError, KeyError):
        log.debug('Malformed message received: %s', message)
        error = True
    if error:
        log.debug('Unknown message type received: %s', msg_type)
        reply = {'type': 'error', 'text': 'Bad message'}
        await client.queue_message(reply)


async def handler(websocket, path):
    global main_server
    server = main_server

    client = server.setup_client(websocket)
    client_address = websocket.remote_address
    log.info("A connection was made from %s", client_address)

    try:
        consumer_task = asyncio.ensure_future(consumer_handler(client))
        producer_task = asyncio.ensure_future(client.message_handler())
        done, pending = await asyncio.wait(
            [consumer_task, producer_task],
            return_when=asyncio.FIRST_COMPLETED,
        )
        # Cancel before throwing exceptions
        for task in pending:
            task.cancel()

        # Consume exceptions
        for task in done:
            exception = task.exception()
            if exception:
                raise exception
    except KeepAliveFailed as e:
        log.debug('Keep-alive failed for %s', client_address)
    except websockets.exceptions.ConnectionClosed as e:
        if e.code not in (1000, 1001):
            log.debug('Connection from %s closed abnormally [%d]. Reason: %s', client_address, e.code, e.reason)
        else:
            log.info('Connection from %s closing normally', client_address)
    except Exception as e:
        log.warning('Connection from %s was terminated. Unknown error \'%s\'.', client_address, e)
    else:
        log.warning('FIX: Unhandled connection shutdown case')
    finally:
        log.debug('Connection from %s used %d kB', client_address, round((client.bytes_sent + client.bytes_received) // 1024))
        server.remove_client(client)
    # Connection automatically closed, if not already, on exit here


async def keyboard_interrupt_checker():
    while True:
        await asyncio.sleep(0.5)


port = 8020
if socket.gethostname() == 'scw-b532e7':
    port = 8765


asyncio.async(keyboard_interrupt_checker())

start_server = websockets.serve(handler, 'localhost', port)
asyncio.get_event_loop().run_until_complete(start_server)
try:
    log.info('BP Server started')
    asyncio.get_event_loop().run_forever()
except KeyboardInterrupt:
    log.info('User stopped server')
finally:
    main_server.close()
