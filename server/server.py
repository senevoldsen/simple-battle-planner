import asyncio
import json
import logging
import socket
import sys
import websockets

from room import Room

'''
    - Problem with some pending tasks not being shut down properly
    - Need room cleaning
    - Room/Client meta handling
'''


# Setup logging
def setup_logger():
    global logging
    logging.TRACE = 5
    logging.addLevelName(logging.TRACE, 'TRACE')
    class BPLogger(logging.getLoggerClass()):
        def __init__(self, name, *args, **kwargs):
            logging.Logger.__init__(self, name, *args, **kwargs)

        def trace(self, msg, *args, **kwargs):
            self.log(logging.TRACE, msg, *args, **kwargs)
    prev_logger_class = logging.getLoggerClass()
    # Restore logger class afterwards
    logging.setLoggerClass(BPLogger)
    logger = logging.getLogger('BP_SERVER')
    logging.setLoggerClass(prev_logger_class)
    return logger

log = setup_logger()
log.setLevel(logging.TRACE)
log_handler = logging.StreamHandler()
log_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
log.addHandler(log_handler)


clients = {}
rooms = {}
next_id = 1

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
            log.debug("Sending to '%d' message '%s'", self.cid, message_json)
            await self.socket.send(message_json)
            self.outgoing_messages.task_done()


async def consumer_handler(client):
    async for message in client.socket:
        client.bytes_received += len(message)
        await handle_message(client, message)

async def handle_message(client, message):
    log.debug('handle_message: %s', message)
    try:
        error = False
        data = json.loads(message)
        msg_type = data['type']
        client_room = client.room

        if msg_type == 'room-join':
            room_name = data['room-name']
            nickname = data['username']

            # Create room if not exists
            if room_name not in rooms:
                new_room = rooms[room_name] = Room(room_name)
            else:
                new_room = rooms[room_name]

            if client_room is not None:
                client_room.member_leave(client)

            # Update client data
            client.name = nickname
            client.room = client_room = room

            # Join new room
            room.member_join(client)

            # Reply success
            reply = {
                'type': 'room-joined',
                'room': room_name,
                'username': nickname
            }
            client.queue_message(reply)
            await client.socket.send(reply)

        elif msg_type == 'room-create':
            # Leave any current rooms
            # Create room
            # Init room state
            # Join room
            pass

        elif msg_type == 'text-message':
            text = data['text']
            if client.room:
                client.room.message_send_text(client, text)

        # Forward if state
        elif msg_type == 'state':
            room = client.room
            if room:
                room.force_set_state(data['value'], exclude=client)
            else:
                log.warning('No room to forward state to')
        elif msg_type == 'key-set':
            if client_room:
                client_room.set_key(client, data['key'], data['value'])
        elif msg_type == 'key-delete':
            if client_room:
                client_room.delete_key(client, data['key'])

        else:
            error = True
    except (json.decoder.JSONDecodeError, KeyError):
        error = True
    if error:
        print("Reporting error back")
        reply = json.dumps({'type': 'error', 'text': 'Bad message'})
        await client.socket.send(reply)

# Create default room
default_room = rooms['default'] = Room('default', persist=True)


async def handler(websocket, path):
    global clients, next_id, default_room
    cid, next_id = next_id, next_id + 1
    client = Client(cid, websocket)
    clients[cid] = client

    client_address = websocket.remote_address
    log.info("A connection was made from %s", client_address)

    client_room = default_room
    client_room.member_join(client)
    client.room = client_room

    try:
        consumer_task = asyncio.ensure_future(consumer_handler(client))
        producer_task = asyncio.ensure_future(client.message_handler())
        done, pending = await asyncio.wait(
            [consumer_task, producer_task],
            return_when=asyncio.FIRST_COMPLETED,
        )
        # Consume exceptions
        for task in done:
            exception = task.exception()
            if exception:
                raise exception
        for task in pending:
            task.cancel()
        print(done, pending)
    except websockets.exceptions.ConnectionClosed:
        log.info('Connection from %s was unexpectedly closed', client_address)
    except Exception as e:
        log.warning('Unknown error \'%s\'. Connection from %s was terminated', e, client_address)
    finally:
        log.debug('Connection from %s used %d kB', client_address, round((client.bytes_sent + client.bytes_received) // 1024))
        log.info('Connection from %s was closed', client_address)
        if client.room is not None:
            client.room.member_leave(client)
        del clients[cid]


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
