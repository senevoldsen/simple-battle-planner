"""Manages a single room"""

import collections
import asyncio
import json
import copy
import logging
import datetime

from config import log, log_method_call


class Room(object):
    """A room for collaboration"""
    def __init__(self, name, server, persistent=False):
        super(Room, self).__init__()
        self.name = name
        self.server = server
        self.clients = collections.OrderedDict()
        self.state = collections.OrderedDict()
        self.went_empty_time = datetime.datetime.now()  # Will be used to plan for deletions of idle/empty rooms
        self.persistent = persistent  # Room will not be deleted despite above

    @log_method_call
    def member_join(self, client):
        self.clients[client.cid] = client
        join_msg = {
            'type': 'client-join',
            'name': client.name
        }
        self._broadcast_message(join_msg, exclude=client)
        approve_msg = {
            'type': 'room-joined',
            'name': self.name,
            'clients': [{'name': c.name, 'cid': c.cid} for c in self.clients.values() if c != client]
        }
        self._send_message(client, approve_msg)
        self.send_state(client)
        self.went_empty_time = None

    @log_method_call
    def member_leave(self, client):
        self.clients.pop(client.cid, 'IGNORED')
        if len(self.clients) == 0:
            self.went_empty_time = datetime.datetime.now()

    @log_method_call
    def send_state(self, client):
        state_msg = {
            'type': 'state',
            'value': copy.deepcopy(self.state)
        }
        self._send_message(client, state_msg)

    @log_method_call
    def force_set_state(self, state, exclude=None):
        self._replace_state(state)
        excludes = self._make_exclude_set(exclude)
        for client in self.clients.values():
            if client not in excludes:
                self.send_state(client)
        self._state_modified()

    @log_method_call
    def set_key(self, client, key, value):
        self.state[key] = value
        message = {
            'type': 'key-set',
            'key': key,
            'value': value
        }
        self._broadcast_message(message, exclude=client)
        self._state_modified()

    @log_method_call
    def delete_key(self, client, key):
        message = {
            'type': 'key-delete',
            'key': key
        }
        self.state.pop(key, 'IGNORED')
        self._broadcast_message(message, exclude=client)
        self._state_modified()

    @log_method_call
    def send_text(self, text, exclude=None):
        message = {
            'type': 'text-message',
            'text': '%s said: %s' % (from_client.name, text)
        }
        self._broadcast_message(text, exclude)

    def _make_exclude_set(self, exclude=None):
        if exclude is None:
            excludes = set([])
        elif isinstance(exclude, collections.Iterable):
            excludes = set(exclude)
        else:
            excludes = set([exclude])
        return excludes

    def _send_message(self, client, message):
        client.queue_message(message)

    def _broadcast_message(self, message, exclude=None):
        """Typical use of exclude will be the original sender"""
        excludes = self._make_exclude_set(exclude)
        for client in self.clients.values():
            if client not in excludes:
                self._send_message(client, message)

    def _replace_state(self, dict_like):
        self.state = collections.OrderedDict(dict_like)

    def _state_modified(self):
        self.server.room_request_store(self, json.dumps(self.state))

    def try_load_state(self):
        data = self.server.room_request_load(self)
        if data:
            try:
                prev_state = self.state
                self._replace_state(json.loads(data))
            except Exception:
                self.state = prev_state
                log.warning('Data malformed for room \'%s\'', self.name)
